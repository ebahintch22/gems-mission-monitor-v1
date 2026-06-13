(function (global) {
  class LayerBoxManager {
    constructor(host, options = {}) {
      if (!host) {
        throw new Error("LayerBoxManager requires a host element.");
      }
      this.host = host;
      this.rootId = options.rootId || "root";
      this.headerHeight = options.headerHeight || null;
      this.layers = new Map();
      this.stack = [];
      this.handlers = new Map();

      this.host.classList.add("layer-box-host");
      if (this.headerHeight) {
        this.host.style.setProperty("--header-height", this.headerHeight);
      }

      this.push({
        id: this.rootId,
        title: options.rootTitle || "PAL",
        render: options.rootRender || function () {}
      });
    }

    push(definition) {
      const layer = this.ensureLayer(definition);
      this.removeFromStack(layer.id);
      this.stack.push(layer.id);
      this.activateTop();
      this.emit("push", layer.id);
      return layer;
    }

    pop() {
      if (this.stack.length <= 1) {
        return this.getLayer(this.rootId);
      }
      const activeId = this.stack.pop();
      this.unloadLayer(activeId);
      const active = this.activateTop();
      this.emit("pop", active?.id);
      return active;
    }

    replace(definition) {
      if (!this.stack.length) {
        return this.push(definition);
      }
      if (this.stack[this.stack.length - 1] === this.rootId) {
        return this.push(definition);
      }
      const previousId = this.stack.pop();
      if (previousId !== this.rootId) {
        this.unloadLayer(previousId);
      }
      return this.push(definition);
    }

    renderToLayer(id, content, options = {}) {
      if (id === this.rootId) {
        return undefined;
      }
      const layer = this.ensureLayer({
        id,
        title: options.title || id,
        render: function () {}
      });
      this.renderContent(layer, content);
      this.emit("content-updated", id);
      if (options.activate) {
        return this.activateLayer(id);
      }
      return layer;
    }

    activateLayer(id) {
      const layer = this.getLayer(id);
      if (!layer) {
        return undefined;
      }
      const stackIndex = this.stack.indexOf(id);
      if (stackIndex >= 0) {
        this.stack.splice(stackIndex + 1).forEach((removedId) => {
          if (removedId !== this.rootId) {
            this.unloadLayer(removedId);
          }
        });
      } else {
        this.stack.push(id);
      }
      this.activateTop();
      return layer;
    }

    getLayer(id) {
      return this.layers.get(id);
    }

    destroyLayer(id) {
      if (id === this.rootId) {
        return false;
      }
      const layer = this.getLayer(id);
      if (!layer) {
        return false;
      }
      this.removeFromStack(id);
      this.unloadLayer(id);
      this.activateTop();
      return true;
    }

    on(event, handler) {
      if (!this.handlers.has(event)) {
        this.handlers.set(event, new Set());
      }
      this.handlers.get(event).add(handler);
      return () => this.handlers.get(event)?.delete(handler);
    }

    ensureLayer(definition) {
      if (!definition?.id) {
        throw new Error("LayerBox id is required.");
      }
      const existing = this.layers.get(definition.id);
      if (existing) {
        if (definition.title) {
          existing.title = definition.title;
          existing.titleElement.textContent = definition.title;
        }
        if (definition.onClose) {
          existing.onClose = definition.onClose;
        }
        return existing;
      }

      const element = document.createElement("section");
      const header = document.createElement("div");
      const title = document.createElement("h2");
      const content = document.createElement("div");
      const closeButton = document.createElement("button");
      const id = definition.id;

      element.className = "layer-box";
      element.dataset.layerBoxId = id;
      element.style.display = "none";
      header.className = "layer-box-header";
      title.className = "layer-box-title";
      title.textContent = definition.title || id;
      content.className = "layer-box-content";

      header.append(title);
      if (id !== this.rootId) {
        closeButton.className = "layer-box-close";
        closeButton.type = "button";
        closeButton.setAttribute("aria-label", "Fermer");
        closeButton.textContent = "x";
        closeButton.addEventListener("click", () => this.pop());
        header.append(closeButton);
      }

      element.append(header, content);
      this.host.append(element);

      const layer = {
        id,
        title: definition.title || id,
        element,
        content,
        titleElement: title,
        onClose: definition.onClose
      };
      this.layers.set(id, layer);
      this.renderContent(layer, definition.render);
      return layer;
    }

    renderContent(layer, content) {
      layer.content.replaceChildren();
      if (typeof content === "function") {
        content(layer.content);
      } else if (content instanceof HTMLElement) {
        layer.content.append(content);
      } else if (typeof content === "string") {
        layer.content.innerHTML = content;
      }
    }

    activateTop() {
      const activeId = this.stack[this.stack.length - 1];
      let activeLayer;
      this.layers.forEach((layer) => {
        const isActive = layer.id === activeId;
        layer.element.style.display = isActive ? "flex" : "none";
        layer.element.classList.toggle("is-active", isActive);
        if (isActive) {
          activeLayer = layer;
        }
      });
      if (activeLayer) {
        this.emit("activate", activeLayer.id);
      }
      return activeLayer;
    }

    unloadLayer(id) {
      const layer = this.layers.get(id);
      if (!layer || id === this.rootId) {
        return;
      }
      if (typeof layer.onClose === "function") {
        layer.onClose();
      }
      layer.element.remove();
      this.layers.delete(id);
    }

    removeFromStack(id) {
      this.stack = this.stack.filter((layerId) => layerId !== id);
    }

    emit(event, id) {
      (this.handlers.get(event) || []).forEach((handler) => handler({ id, manager: this }));
    }
  }

  global.LayerBoxManager = LayerBoxManager;
}(window));

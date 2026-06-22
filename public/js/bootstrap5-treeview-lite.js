(function (global) {
  class BootstrapTreeViewLite {
    constructor(host, options = {}) {
      if (!host) {
        throw new Error("BootstrapTreeViewLite requires a host element.");
      }
      this.host = host;
      this.nodes = [];
      this.selectedKey = null;
      this.onSelect = typeof options.onSelect === "function" ? options.onSelect : function () {};
      this.host.classList.add("bootstrap5-treeview-lite");
    }

    setData(nodes) {
      this.nodes = Array.isArray(nodes) ? nodes : [];
      this.render();
    }

    clearSelection() {
      this.selectedKey = null;
      this.render();
    }

    render() {
      this.host.replaceChildren();
      const list = document.createElement("div");
      list.className = "b5-treeview-list";
      this.nodes.forEach((node) => {
        list.append(this.renderNode(node, 1));
      });
      this.host.append(list);
    }

    renderNode(node, level) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const label = document.createElement("span");
      const badge = document.createElement("span");
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;

      details.className = `b5-treeview-node b5-treeview-level-${level}`;
      details.open = Boolean(node.expanded || level < 2 || this.isSelectedBranch(node));
      details.dataset.nodeKey = node.key || "";
      summary.className = "b5-treeview-item";
      summary.setAttribute("role", "treeitem");
      summary.setAttribute("aria-selected", String(this.selectedKey === node.key));
      summary.addEventListener("click", () => {
        this.selectedKey = node.key;
        this.onSelect(node);
        window.setTimeout(() => this.render(), 0);
      });

      label.className = "b5-treeview-label";
      label.textContent = node.label || "";
      badge.className = "b5-treeview-badge";
      badge.textContent = String(node.count || 0);
      summary.append(label, badge);
      details.append(summary);

      if (hasChildren) {
        const children = document.createElement("div");
        children.className = "b5-treeview-children";
        node.children.forEach((child) => {
          children.append(this.renderNode(child, level + 1));
        });
        details.append(children);
      }

      return details;
    }

    isSelectedBranch(node) {
      if (!this.selectedKey || !Array.isArray(node.children)) {
        return false;
      }
      return node.children.some((child) => child.key === this.selectedKey || this.isSelectedBranch(child));
    }
  }

  global.BootstrapTreeViewLite = BootstrapTreeViewLite;
}(window));

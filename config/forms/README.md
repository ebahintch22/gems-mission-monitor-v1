# Form mappings

Each XLSForm JSON mapping must use the multipart structure below:

```txt
config/forms/
  <form_id>.json
  <form_id>/
    choiceLists.index.json
    choices/
      <choice_list_name>.json
```

The main `<form_id>.json` file contains the structural mapping only:

- form metadata
- summary fields
- sections
- fields
- field-level `choiceList` references

The main file must not embed the heavy `choiceLists` object. Choice lists are stored in separate files and loaded on demand by `formMappingService.loadChoiceList()`.

Use `scripts/generate-xlsform-mapping.ps1` to generate this structure from a XLSForm. The generator derives `<form_id>` from `settings.id_string` and writes the corresponding mapping and choice-list files.

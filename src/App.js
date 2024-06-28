import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import AceEditor from "react-ace";

import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-tomorrow";
import './App.css'

const App = () => {
  const { register, control, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      credentialDefinition: [],
      jsonSchema: "{}",
      credentialFormat: true,
    },
  });

  const [editorValue, setEditorValue] = useState("{}");
  const [editorError, setEditorError] = useState(null);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "credentialDefinition",
  });

  const handleJsonSchemaChange = (newValue) => {
    setValue("jsonSchema", newValue);
    setEditorValue(newValue);

    try {
      const parsedSchema = JSON.parse(newValue);
      setEditorError(null); // Clear any previous errors

      if (Object.keys(parsedSchema).length === 0) {
        setValue("credentialDefinition", []);
        return;
      }

      const newSections = parseSchema(parsedSchema, watch("credentialFormat"));
      setValue("credentialDefinition", newSections);
      updateLimitValue(parsedSchema);
    } catch (e) {
      console.error("Invalid JSON schema", e);
      setEditorError("Invalid JSON: " + e.message);
    }
  };

  const parseSchema = (schema, credentialFormat) => {
    const sections = [];
    for (const [key, value] of Object.entries(schema.properties || {})) {
      const section = {
        name: key,
        type: value.type,
        required: (schema.required || []).includes(key),
        limitDisclosure: credentialFormat,
      };
      if (value.type === 'object' && value.properties) {
        section.properties = parseSchema(value, credentialFormat);
      } else if (value.type === 'array' && value.items) {
        section.items = { type: value.items.type };
      }
      sections.push(section);
    }
    return sections;
  };

  const generateJsonSchema = (sections, credentialFormat) => {
    const properties = {};
    const required = [];
    sections.forEach((section) => {
      properties[section.name] = { type: section.type };
      if (section.required) required.push(section.name);
      if (section.type === 'object' && section.properties) {
        properties[section.name].properties = generateJsonSchema(section.properties, credentialFormat).properties;
      } else if (section.type === 'array' && section.items) {
        properties[section.name].items = { type: section.items.type };
      }
      if (credentialFormat) {
        properties[section.name].limitDisclosure = section.limitDisclosure ? "required" : "optional";
      }
    });
    return { type: "object", properties, required };
  };

  const watchCredentialDefinition = watch("credentialDefinition");

  const handleTypeChange = (index, value) => {
    setValue(`credentialDefinition.${index}.type`, value);
  };

  useEffect(() => {
    const newJsonSchema = generateJsonSchema(
      watchCredentialDefinition,
      watch("credentialFormat")
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    setValue("jsonSchema", newJsonSchemaString);
    setEditorValue(newJsonSchemaString);
    updateLimitValue(newJsonSchema);
  }, [watchCredentialDefinition, setValue, watch]);

  const updateLimitValue = (jsonData) => {
    const updateProperty = (prop) => {
      if (prop && typeof prop === 'object') {
        if (prop.type === 'object' && prop.properties) {
          Object.values(prop.properties).forEach(updateProperty);
        } else if (prop.type === 'array' && prop.items) {
          updateProperty(prop.items);
        }
        prop.limitDisclosure = watch("credentialFormat") ? "required" : "optional";
      }
    };

    if (jsonData && jsonData.properties) {
      Object.values(jsonData.properties).forEach(updateProperty);
    }
  };

  const handleCredentialFormatValueChange = (event) => {
    const isChecked = event.target.checked;
    setValue("credentialFormat", isChecked);

    const currentJsonSchema = JSON.parse(watch("jsonSchema"));

    const updatedJsonSchema = updateLimitDisclosure(
      currentJsonSchema,
      isChecked
    );

    const updatedJsonSchemaString = JSON.stringify(updatedJsonSchema, null, 2);
    setValue("jsonSchema", updatedJsonSchemaString);
    setEditorValue(updatedJsonSchemaString);
  };

  const updateLimitDisclosure = (schema, newValue) => {
    if (schema && typeof schema === 'object') {
      if (schema.type === 'object' && schema.properties) {
        Object.values(schema.properties).forEach(prop => updateLimitDisclosure(prop, newValue));
      } else if (schema.type === 'array' && schema.items) {
        updateLimitDisclosure(schema.items, newValue);
      }
      schema.limitDisclosure = newValue ? "required" : "optional";
    }
    return schema;
  };

  return (
    <div className="app-container">
      <form onSubmit={handleSubmit(() => {})}>
        <div className="editor-container">
          <label>JSON Schema Editor:</label>
          <div className="editor-wrapper">
            <AceEditor
              mode="json"
              theme="tomorrow"
              onChange={handleJsonSchemaChange}
              name="json-editor"
              editorProps={{ $blockScrolling: true }}
              value={editorValue}
              setOptions={{
                showLineNumbers: true,
                tabSize: 2,
              }}
              width="100%"
              height="400px"
              fontSize={14}
              style={{ border: '1px solid #ccc' }}
            />
          </div>
          {editorError && <div className="error-message">{editorError}</div>}
        </div>
        <div className="checkbox-container">
          <label>
            <input
              type="checkbox"
              {...register("credentialFormat")}
              onChange={handleCredentialFormatValueChange}
              checked={watch("credentialFormat")}
            />
            Limit Disclosure
          </label>
        </div>
        <button
          type="button"
          className="add-section-button"
          onClick={() =>
            append({
              name: "",
              type: "string",
              properties: [],
              items: {},
              required: true,
              limitDisclosure: watch("credentialFormat"),
            })
          }
        >
          Add Section
        </button>
        <ul className="fields-list">
          {fields.map((field, index) => (
            <li key={field.id} className="field-item">
              <input
                {...register(`credentialDefinition.${index}.name`)}
                placeholder="Input Name"
                className="input-field"
              />
              <select
                {...register(`credentialDefinition.${index}.type`)}
                onChange={(e) => handleTypeChange(index, e.target.value)}
                className="select-field"
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
                <option value="array">array</option>
              </select>
              <button type="button" onClick={() => remove(index)} className="remove-button">
                Remove
              </button>
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
};

export default App;
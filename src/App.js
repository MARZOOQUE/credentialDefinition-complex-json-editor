import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import AceEditor from "react-ace";

import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-tomorrow";
import "./App.css";

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
      updateCredentialFormatValue(parsedSchema);
    } catch (e) {
      console.error("Invalid JSON schema", e);
      setEditorError("Invalid JSON: " + e.message);
    }
  };

  const parseSchema = (schema, credentialFormatValue) => {
    const parseProperties = (properties, requiredFields) => {
      return Object.keys(properties).map((key) => {
        const property = properties[key];
        const parsedProperty = {
          name: key,
          type: property.type,
          required: requiredFields.includes(key),
          limitDisclosure:
            property.limitDisclosure !== undefined
              ? property.limitDisclosure
              : credentialFormatValue,
        };

        if (property.type === "object") {
          parsedProperty.properties = parseProperties(
            property.properties || {},
            property.required || []
          );
        } else if (property.type === "array") {
          parsedProperty.items = parseItems(
            property.items || { type: "string" }
          );
        }

        return parsedProperty;
      });
    };

    const parseItems = (items) => {
      if (Array.isArray(items)) {
        return {
          type: "array",
          items: items.map((item) => parseItems(item)),
        };
      }

      if (items.type === "object") {
        return {
          type: "object",
          properties: parseProperties(
            items.properties || {},
            items.required || []
          ),
          limitDisclosure:
            items.limitDisclosure !== undefined
              ? items.limitDisclosure
              : credentialFormatValue,
        };
      }

      return items;
    };

    return Object.keys(schema.properties).map((key) => {
      const property = schema.properties[key];
      return {
        name: key,
        type: property.type,
        properties:
          property.type === "object"
            ? parseProperties(
                property.properties || {},
                property.required || []
              )
            : {},
        items:
          property.type === "array" ? parseItems(property.items || {}) : {},
        required: schema.required ? schema.required.includes(key) : false,
        limitDisclosure:
          property.limitDisclosure !== undefined
            ? property.limitDisclosure
            : credentialFormatValue,
      };
    });
  };

  const generateJsonSchema = (sections, credentialFormatValue) => {
    const generateProperties = (properties) => {
      if (!Array.isArray(properties)) {
        return {};
      }

      return properties.reduce((acc, property) => {
        acc[property.name] = { type: property.type };

        // Add or update limitDisclosure attribute based on credentialFormat
        if (property.limitDisclosure !== undefined) {
          acc[property.name].limitDisclosure = property.limitDisclosure;
        } else {
          acc[property.name].limitDisclosure = credentialFormatValue;
        }

        if (property.type === "object") {
          acc[property.name].properties = generateProperties(
            property.properties || []
          );
          acc[property.name].required = property.properties
            ? property.properties
                .filter((prop) => prop.required)
                .map((prop) => prop.name)
            : [];
        } else if (property.type === "array") {
          acc[property.name].items = generateItems(
            property.items || { type: "string" }
          );
        }

        return acc;
      }, {});
    };

    const generateItems = (items) => {
      if (Array.isArray(items)) {
        return {
          type: "array",
          items: items.map((item) => generateItems(item)),
        };
      }

      if (items.type === "object") {
        return {
          type: "object",
          properties: generateProperties(items.properties || []),
          required: items.properties
            ? items.properties
                .filter((prop) => prop.required)
                .map((prop) => prop.name)
            : [],
          limitDisclosure:
            items.limitDisclosure !== undefined
              ? items.limitDisclosure
              : credentialFormatValue,
        };
      }

      return items;
    };

    const schema = {
      type: "object",
      properties: {},
      required: [],
    };

    sections.forEach((section) => {
      schema.properties[section.name] = {
        type: section.type,
        limitDisclosure:
          section.limitDisclosure !== undefined
            ? section.limitDisclosure
            : credentialFormatValue,
      };

      if (section.type === "object") {
        schema.properties[section.name].properties = generateProperties(
          section.properties || []
        );

        if (section.properties && Array.isArray(section.properties)) {
          schema.properties[section.name].required = section.properties
            .filter((prop) => prop.required)
            .map((prop) => prop.name);
        }
      } else if (section.type === "array") {
        schema.properties[section.name].items = generateItems(
          section.items || { type: "string" }
        );
      }

      if (section.required) {
        schema.required.push(section.name);
      }
    });

    return schema;
  };

  const watchCredentialDefinition = watch("credentialDefinition");

  const handleTypeChange = (index, value) => {
    setValue(`credentialDefinition.${index}.type`, value);
  };

  const lastJsonSchema = React.useRef(null);


  useEffect(() => {
    const newJsonSchema = generateJsonSchema(
      watchCredentialDefinition,
      watch("credentialFormat")
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    if (newJsonSchemaString !== lastJsonSchema.current) {
      lastJsonSchema.current = newJsonSchemaString;
      setValue("jsonSchema", newJsonSchemaString);
      setEditorValue(newJsonSchemaString);

      updateCredentialFormatValue(newJsonSchema, watch, setValue);
    }
  }, [watchCredentialDefinition, handleTypeChange]);

  const updateLimitDisclosure = (schema, newValue) => {
    const traverseAndUpdate = (obj) => {
      if (typeof obj === "object" && obj !== null) {
        Object.keys(obj).forEach((key) => {
          if (key === "limitDisclosure") {
            obj[key] = newValue; // Update the limitDisclosure property
          }
          traverseAndUpdate(obj[key]);
        });
      } else if (Array.isArray(obj)) {
        obj.forEach((item) => traverseAndUpdate(item));
      }
    };
  
    // Deep copy the schema to prevent mutation of the original object
    const updatedSchema = JSON.parse(JSON.stringify(schema));
    traverseAndUpdate(updatedSchema);
    return updatedSchema;
  };

  const handleCredentialFormatValueChange = (event) => {
    const isChecked = event.target.checked;
    setValue("credentialFormat", isChecked);
  
    // Get the current JSON schema value
    const currentJsonSchema = JSON.parse(watch("jsonSchema"));
  
    // If the schema is empty, don't update it
    if (Object.keys(currentJsonSchema.properties).length === 0) {
      return;
    }
  
    // Update each limitDisclosure property based on the isChecked value
    const updatedJsonSchema = updateLimitDisclosure(currentJsonSchema, isChecked);
  
    // Set the updated JSON schema value
    setValue("jsonSchema", JSON.stringify(updatedJsonSchema, null, 2));
  
    updateCredentialFormatValue(updatedJsonSchema);
  
    try {
      const newSections = parseSchema(
        updatedJsonSchema,
        watch("credentialFormat")
      );
      setValue("credentialDefinition", newSections);
    } catch (e) {
      console.error("Invalid JSON schema", e);
    }
  };




  const updateCredentialFormatValue = (jsonData) => {
    let hasTrueValue = false;
    let hasLimitDisclosure = false;
  
    function traverse(obj) {
      if (typeof obj === "object" && obj !== null) {
        Object.keys(obj).forEach((key) => {
          if (key === "limitDisclosure") {
            hasLimitDisclosure = true;
            if (obj[key] === true) {
              hasTrueValue = true;
            }
          }
          traverse(obj[key]);
        });
      } else if (Array.isArray(obj)) {
        obj.forEach((item) => traverse(item));
      }
    }
  
    traverse(jsonData);
  
    // If there are no limitDisclosure properties, keep the current value
    if (!hasLimitDisclosure) {
      return;
    }
  
    setValue("credentialFormat", hasTrueValue);
  };

console.log("credentialFormat)", watch("credentialFormat"))

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
              style={{ border: "1px solid #ccc" }}
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
              <button
                type="button"
                onClick={() => remove(index)}
                className="remove-button"
              >
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

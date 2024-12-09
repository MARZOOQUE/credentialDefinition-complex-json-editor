import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";

import MonacoEditor from "react-monaco-editor";
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

  // Updated preserveAdditionalProperties function
  const preserveAdditionalProperties = (originalObj, baseObj = {}) => {
    // Create a deep copy of the original object to avoid mutation
    const result = JSON.parse(JSON.stringify(baseObj));

    // List of common JSON Schema validation keywords to preserve
    const schemaValidationKeywords = [
      'minLength', 
      'maxLength', 
      'pattern', 
      'format', 
      'minimum', 
      'maximum', 
      'exclusiveMinimum', 
      'exclusiveMaximum', 
      'multipleOf', 
      'enum', 
      'const',
      'description',
      'title'
    ];

    // Dynamically copy all properties from the original object
    Object.keys(originalObj).forEach(key => {
      // Skip specific keys that are handled separately
      const reservedKeys = ['name', 'type', 'properties', 'items', 'required', 'limitDisclosure'];
      
      // Preserve schema validation keywords and any other properties not in reserved keys
      if (!reservedKeys.includes(key) && 
          (schemaValidationKeywords.includes(key) || 
           !reservedKeys.some(reservedKey => key.includes(reservedKey)))) {
        result[key] = originalObj[key];
      }
    });

    return result;
  };

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

// Updated parseSchema function to preserve additional properties
const parseSchema = (schema, credentialFormatValue) => {
  const parseProperties = (properties, requiredFields) => {
    return Object.keys(properties).map((key) => {
      const property = properties[key];
      
      // Create a copy of the original property to preserve additional properties
      const parsedProperty = {
        ...property, // Spread the original property to keep all additional properties
        name: key,
        type: property.type,
        required: requiredFields.includes(key),
        limitDisclosure:
          property.limitDisclosure !== undefined
            ? property.limitDisclosure
            : credentialFormatValue,
      };

      // Remove specific keys that we've explicitly handled
      delete parsedProperty.properties;
      delete parsedProperty.items;

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
        ...items, // Preserve additional properties
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
      ...property, // Spread the original property to keep all additional properties
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

// Updated generateJsonSchema function to preserve additional properties
const generateJsonSchema = (sections, credentialFormatValue) => {
  const generateProperties = (properties) => {
    if (!Array.isArray(properties)) {
      return {};
    }

    return properties.reduce((acc, property) => {
      // Preserve all original properties except the ones we're explicitly handling
      const propertySchema = { 
        type: property.type,
        ...Object.fromEntries(
          Object.entries(property)
            .filter(([key]) => 
              !['name', 'type', 'properties', 'items', 'required', 'limitDisclosure'].includes(key)
            )
        ),
        limitDisclosure: property.limitDisclosure !== undefined 
          ? property.limitDisclosure 
          : credentialFormatValue
      };

      if (property.type === "object") {
        propertySchema.properties = generateProperties(property.properties || []);
        propertySchema.required = property.properties
          ? property.properties
              .filter((prop) => prop.required)
              .map((prop) => prop.name)
          : [];
      } else if (property.type === "array") {
        propertySchema.items = generateItems(property.items || { type: "string" });
      }

      return { ...acc, [property.name]: propertySchema };
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
        // Preserve all original properties except the ones we're explicitly handling
        ...Object.fromEntries(
          Object.entries(items)
            .filter(([key]) => 
              !['type', 'properties', 'required', 'limitDisclosure'].includes(key)
            )
        ),
        type: "object",
        properties: generateProperties(items.properties || []),
        required: items.properties
          ? items.properties
              .filter((prop) => prop.required)
              .map((prop) => prop.name)
          : [],
        limitDisclosure: items.limitDisclosure !== undefined
          ? items.limitDisclosure
          : credentialFormatValue
      };
    }

    // For primitive types, preserve all properties
    return Object.fromEntries(
      Object.entries(items)
        .filter(([key]) => key !== 'type')
    );
  };

  const schema = {
    type: "object",
    properties: {},
    required: [],
  };

  sections.forEach((section) => {
    // Preserve all original properties except the ones we're explicitly handling
    const sectionSchema = {
      ...Object.fromEntries(
        Object.entries(section)
          .filter(([key]) => 
            !['name', 'type', 'properties', 'items', 'required', 'limitDisclosure'].includes(key)
          )
      ),
      type: section.type,
      limitDisclosure: section.limitDisclosure !== undefined
        ? section.limitDisclosure
        : credentialFormatValue
    };

    if (section.type === "object") {
      sectionSchema.properties = generateProperties(section.properties || []);

      if (section.properties && Array.isArray(section.properties)) {
        sectionSchema.required = section.properties
          .filter((prop) => prop.required)
          .map((prop) => prop.name);
      }
    } else if (section.type === "array") {
      sectionSchema.items = generateItems(
        section.items || { type: "string" }
      );
    }

    schema.properties[section.name] = sectionSchema;

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
    const updatedJsonSchema = updateLimitDisclosure(
      currentJsonSchema,
      isChecked
    );

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
    let hasLimitDisclosure = false;
    let hasFalseValue = false;
  
    function traverse(obj) {
      if (typeof obj === "object" && obj !== null) {
        Object.keys(obj).forEach((key) => {
          if (key === "limitDisclosure") {
            hasLimitDisclosure = true;
            if (obj[key] === false) {
              hasFalseValue = true;
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
      setValue("credentialFormat", false)
      return;
    }
  
    // If at least one false value is found, set credentialFormat to false
    if (hasFalseValue) {
      setValue("credentialFormat", false);
    }
    // If all values are true, do nothing (keep the current value)
  };

  return (
    <div className="app-container">
      <form onSubmit={handleSubmit(() => {})}>
        <div className="editor-container">
          <label>JSON Schema Editor:</label>
          {editorError && <div className="error-message">{editorError}</div>}
          <div className="editor-wrapper">
            <MonacoEditor
              width="800"
              height="600"
              language="json"
              theme="vs-black"
              value={editorValue}
              onChange={handleJsonSchemaChange}
              options={{
                selectOnLineNumbers: true,
                minimap: { enabled: false },
              }}
            />
          </div>
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
/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";

const App = () => {
  const { register, control, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      credentialDefinition: [],
      jsonSchema: "",
      limitValue: true
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "credentialDefinition",
  });

  const handleJsonSchemaChange = (event) => {
    const inputValue = event.target.value;
    setValue("jsonSchema", inputValue);

    if (inputValue.trim() === "") {
      setValue("credentialDefinition", []);
      return;
    }

    try {
      const parsedSchema = JSON.parse(inputValue);
      const newSections = parseSchema(parsedSchema);
      console.log("newSections", newSections)
      setValue("credentialDefinition", newSections);
    } catch (e) {
      console.error("Invalid JSON schema", e);
    }
  };

  const parseSchema = (schema) => {
    const parseProperties = (properties, requiredFields) => {
      return Object.keys(properties).map((key) => {
        const property = properties[key];
        const parsedProperty = {
          name: key,
          type: property.type,
          required: requiredFields.includes(key),
        };
  
        if (property.type === "object") {
          parsedProperty.properties = parseProperties(property.properties || {}, property.required || []);
        } else if (property.type === "array") {
          parsedProperty.items = parseItems(property.items || { type: "string" });
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
          properties: parseProperties(items.properties || {}, items.required || []),
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
            ? parseProperties(property.properties || {}, property.required || [])
            : {},
        items: property.type === "array" ? parseItems(property.items || {}) : {},
        required: schema.required ? schema.required.includes(key) : false,
      };
    });
  };
  
  const generateJsonSchema = (sections) => {
    const generateProperties = (properties) => {
      if (!Array.isArray(properties)) {
        return {};
      }
  
      return properties.reduce((acc, property) => {
        acc[property.name] = { type: property.type };
  
        if (property.type === "object") {
          acc[property.name].properties = generateProperties(property.properties || []);
          acc[property.name].required = property.properties
            ? property.properties
                .filter((prop) => prop.required)
                .map((prop) => prop.name)
            : [];
        } else if (property.type === "array") {
          acc[property.name].items = generateItems(property.items || { type: "string" });
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
      };
  
      if (section.type === "object") {
        schema.properties[section.name].properties = generateProperties(section.properties || []);
  
        if (section.properties && Array.isArray(section.properties)) {
          schema.properties[section.name].required = section.properties
            .filter((prop) => prop.required)
            .map((prop) => prop.name);
        }
      } else if (section.type === "array") {
        schema.properties[section.name].items = generateItems(section.items || { type: "string" });
      }
  
      if (section.required) {
        schema.required.push(section.name);
      }
    });
  
    return schema;
  };
  

  const watchCredentialDefinition = watch("credentialDefinition");

  const lastJsonSchema = useRef(null);

  const handleTypeChange = (index, value) => {
    setValue(`credentialDefinition.${index}.type`, value);
  };

  useEffect(() => {
    const newJsonSchema = generateJsonSchema(watchCredentialDefinition);
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    if (newJsonSchemaString !== lastJsonSchema.current) {
      lastJsonSchema.current = newJsonSchemaString;
      setValue("jsonSchema", newJsonSchemaString);
    }
  }, [watchCredentialDefinition, setValue, handleTypeChange]);

  return (
    <div>
      <form onSubmit={handleSubmit(() => {})}>
        <div>
          <label>Paste JSON Schema:</label>
          <textarea
            onChange={handleJsonSchemaChange}
            value={watch("jsonSchema")}
            placeholder="Paste JSON schema here"
            rows="20"
            cols="80"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            append({
              name: "",
              type: "string",
              properties: [],
              items: {},
              required:true
            })
          }
        >
          Add Section
        </button>
        <ul>
          {fields.map((field, index) => (
            <li key={field.id}>
              <input
                {...register(`credentialDefinition.${index}.name`)}
                placeholder="Input Name"
              />
              <select
                {...register(`credentialDefinition.${index}.type`)}
                onChange={(e) => handleTypeChange(index, e.target.value)}
              >
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
                <option value="array">array</option>
              </select>
              <button type="button" onClick={() => remove(index)}>
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

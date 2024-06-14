/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";

const App = () => {
  const { register, control, handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      credentialDefinition: [],
      jsonSchema: "",
      credentialFormat: true,
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
      const newSections = parseSchema(parsedSchema, watch("credentialFormat"));
      setValue("credentialDefinition", newSections);
      updateLimitValue(parsedSchema);
    } catch (e) {
      console.error("Invalid JSON schema", e);
    }
  };

  const parseSchema = (schema, credentialFormat) => {
    const parseProperties = (properties, requiredFields) => {
      return Object.keys(properties).map((key) => {
        const property = properties[key];
        const parsedProperty = {
          name: key,
          type: property.type,
          required: requiredFields.includes(key),
          limitDisclosure: property.limitDisclosure !== undefined ? property.limitDisclosure : credentialFormat,
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
          limitDisclosure: items.limitDisclosure !== undefined ? items.limitDisclosure : credentialFormat,
        };
      }

      return items;
    };

    return Object.keys(schema.properties).map((key) => {
      const property = schema.properties[key];
      return {
        name: key,
        type: property.type,
        properties: property.type === "object" ? parseProperties(property.properties || {}, property.required || []) : {},
        items: property.type === "array" ? parseItems(property.items || {}) : {},
        required: schema.required ? schema.required.includes(key) : false,
        limitDisclosure: property.limitDisclosure !== undefined ? property.limitDisclosure : credentialFormat,
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

        // Add limitDisclosure attribute based on credentialFormat
        acc[property.name].limitDisclosure = property.limitDisclosure;

        if (property.type === "object") {
          acc[property.name].properties = generateProperties(property.properties || []);
          acc[property.name].required = property.properties
            ? property.properties.filter((prop) => prop.required).map((prop) => prop.name)
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
          required: items.properties ? items.properties.filter((prop) => prop.required).map((prop) => prop.name) : [],
          limitDisclosure: items.limitDisclosure,
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
        limitDisclosure: section.limitDisclosure,
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
    const newJsonSchema = generateJsonSchema(watchCredentialDefinition, watch("credentialFormat"));
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    if (newJsonSchemaString !== lastJsonSchema.current) {
      lastJsonSchema.current = newJsonSchemaString;
      setValue("jsonSchema", newJsonSchemaString);
      updateLimitValue(newJsonSchema);
    }
  }, [watchCredentialDefinition, setValue, handleTypeChange]);


  const  updateLimitValue=(jsonData)=> {
    let count = 0;
    let hasFalseValue = false;

    function traverse(obj) {
        if (typeof obj === 'object' && obj !== null) {
            Object.keys(obj).forEach(key => {
                if (key === "limitDisclosure") {
                    count++;
                    if (typeof obj[key] === 'boolean' && !obj[key]) {
                        hasFalseValue = true;
                    }
                }
                traverse(obj[key]);
            });
        } else if (Array.isArray(obj)) {
            obj.forEach(item => traverse(item));
        }
    }

    traverse(jsonData);

    console.log("count", count)
    console.log("hasFalseValue", hasFalseValue)

    if(hasFalseValue) {
      setValue("credentialFormat", false)
    }else {
      setValue("credentialFormat", true)

    }
}


const handleCredentialFormatValueChange = (event) => {
  const isChecked = event.target.checked;
  setValue("credentialFormat", isChecked);

  // Get the current JSON schema value
  const currentJsonSchema = JSON.parse(watch("jsonSchema"));

  // Update each limitDisclosure property based on the isChecked value
  const updatedJsonSchema = updateLimitDisclosure(currentJsonSchema, isChecked);

  // Set the updated JSON schema value
  setValue("jsonSchema", JSON.stringify(updatedJsonSchema, null, 2));
};

// Function to update limitDisclosure property in the JSON schema
const updateLimitDisclosure = (schema, newValue) => {
  const traverseAndUpdate = (obj) => {
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(key => {
        if (key === "limitDisclosure") {
          obj[key] = newValue; // Update the limitDisclosure property
        }
        traverseAndUpdate(obj[key]);
      });
    } else if (Array.isArray(obj)) {
      obj.forEach(item => traverseAndUpdate(item));
    }
  };

  // Deep copy the schema to prevent mutation of the original object
  const updatedSchema = JSON.parse(JSON.stringify(schema));
  traverseAndUpdate(updatedSchema);
  return updatedSchema;
};


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
        <div>
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

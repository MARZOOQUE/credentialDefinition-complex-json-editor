import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import MonacoEditor from "react-monaco-editor";
import jsf from "json-schema-faker";
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
      setEditorError(null);

      if (Object.keys(parsedSchema).length === 0) {
        setValue("credentialDefinition", []);
        return;
      }

      // Store the original schema for later use
      window._originalSchema = {
        $schema: parsedSchema.$schema,
        title: parsedSchema.title,
        description: parsedSchema.description,
        allOf: parsedSchema.allOf,
        $defs: parsedSchema.$defs,
        ...(parsedSchema.additionalProperties !== undefined && {
          additionalProperties: parsedSchema.additionalProperties,
        }),
        ...Object.fromEntries(
          Object.entries(parsedSchema).filter(
            ([key]) =>
              ![
                "type",
                "properties",
                "required",
                "additionalProperties",
              ].includes(key)
          )
        ),
      };

      const newSections = parseSchema(parsedSchema, watch("credentialFormat"));
      setValue("credentialDefinition", newSections);
      updateCredentialFormatValue(parsedSchema);
    } catch (e) {
      console.error("Invalid JSON schema", e);
      setEditorError("Invalid JSON: " + e.message);
    }
  };

  const detectSchemaType = (schemaObj) => {
    // If type is already defined, use it
    if (schemaObj.type) {
      return schemaObj.type;
    }

    // Handle anyOf or other cases
    if (schemaObj.anyOf || schemaObj.oneOf || schemaObj.allOf) {
      return "object";
    }

    // Handle $ref case - don't traverse into $defs
    if (schemaObj.$ref) {
      return "object"; // Return object as default for $ref without looking into $defs
    }

    // Infer type from structure
    if (schemaObj.properties) {
      return "object";
    }
    if (schemaObj.items) {
      return "array";
    }

    return "string"; // default fallback
  };
  const parseSchema = (schema, credentialFormatValue) => {
    const shouldAddLimitDisclosure = (property) => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };

    const parseProperties = (properties, requiredFields) => {
      return Object.keys(properties).map((key) => {
        const property = properties[key];
        const propertyWithoutLimitDisclosure = { ...property };
        delete propertyWithoutLimitDisclosure.limitDisclosure;

        const parsedProperty = {
          ...propertyWithoutLimitDisclosure,
          name: key,
          required:
            Array.isArray(requiredFields) && requiredFields.includes(key),
        };

        // Detect type if not explicitly defined
        if (!property.type) {
          try {
            parsedProperty.type = detectSchemaType(property);
          } catch (err) {
            console.warn(`Could not detect type for property ${key}:`, err);
            parsedProperty.type = "string";
          }
        } else {
          parsedProperty.type = property.type;
        }

        const limitDisclosureValue = shouldAddLimitDisclosure(property);
        if (limitDisclosureValue !== undefined) {
          parsedProperty.limitDisclosure = limitDisclosureValue;
        }

        if (parsedProperty.type === "object") {
          delete parsedProperty.properties;
          parsedProperty.properties = parseProperties(
            property.properties || {},
            property.required || []
          );

          if (
            property.additionalProperties !== undefined &&
            credentialFormatValue !== "mso_mdoc"
          ) {
            parsedProperty.additionalProperties = property.additionalProperties;
          }
        } else if (parsedProperty.type === "array") {
          delete parsedProperty.items;
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

      if (!items.type) {
        try {
          items.type = detectSchemaType(items);
        } catch (err) {
          console.warn("Could not detect type for array items:", err);
          items.type = "string";
        }
      }

      if (items.type === "object") {
        const itemsWithoutLimitDisclosure = { ...items };
        delete itemsWithoutLimitDisclosure.limitDisclosure;

        const parsedItem = {
          ...itemsWithoutLimitDisclosure,
        };

        if (items.type !== undefined) {
          parsedItem.type = items.type;
        }

        delete parsedItem.properties;
        parsedItem.properties = parseProperties(
          items.properties || {},
          items.required || []
        );

        const limitDisclosureValue = shouldAddLimitDisclosure(items);
        if (limitDisclosureValue !== undefined) {
          parsedItem.limitDisclosure = limitDisclosureValue;
        }

        if (
          items.additionalProperties !== undefined &&
          credentialFormatValue !== "mso_mdoc"
        ) {
          parsedItem.additionalProperties = items.additionalProperties;
        }

        return parsedItem;
      }

      return items;
    };

    const result = Object.keys(schema.properties || {}).map((key) => {
      const property = schema.properties[key];
      const propertyWithoutLimitDisclosure = { ...property };
      delete propertyWithoutLimitDisclosure.limitDisclosure;

      const parsedProperty = {
        ...propertyWithoutLimitDisclosure,
        name: key,
        required: schema.required ? schema.required.includes(key) : false,
      };

      if (!property.type) {
        try {
          parsedProperty.type = detectSchemaType(property);
        } catch (err) {
          console.warn(`Could not detect type for property ${key}:`, err);
          parsedProperty.type = "string";
        }
      } else {
        parsedProperty.type = property.type;
      }

      if (parsedProperty.type === "object") {
        delete parsedProperty.properties;
        parsedProperty.properties = parseProperties(
          property.properties || {},
          property.required || []
        );

        if (
          property.additionalProperties !== undefined &&
          credentialFormatValue !== "mso_mdoc"
        ) {
          parsedProperty.additionalProperties = property.additionalProperties;
        }
      } else if (parsedProperty.type === "array") {
        delete parsedProperty.items;
        parsedProperty.items = parseItems(property.items || {});
      }

      const limitDisclosureValue = shouldAddLimitDisclosure(property);
      if (limitDisclosureValue !== undefined) {
        parsedProperty.limitDisclosure = limitDisclosureValue;
      }

      return parsedProperty;
    });

    if (
      schema.additionalProperties !== undefined &&
      credentialFormatValue !== "mso_mdoc"
    ) {
      result.additionalProperties = schema.additionalProperties;
    }

    return result;
  };

  const generateJsonSchema = (sections, credentialFormatValue) => {
    const shouldAddLimitDisclosure = (property) => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };

    // Helper function to check if a property has a $ref to $defs or definitions
    const hasDefinitionReference = (property) => {
      const isDefRef = (ref) => {
        return ref && (ref.startsWith("#/$defs/") || ref.startsWith("#/definitions/"));
      };
    
      // Create a flag to track if we found a definition reference
      let hasRef = false;
    
      // Check direct anyOf with $ref
      if (property.anyOf && Array.isArray(property.anyOf)) {
        hasRef = property.anyOf.some((item) => isDefRef(item.$ref));
      }
      // Check items.anyOf with $ref for arrays
      if (property.items && property.items.anyOf && Array.isArray(property.items.anyOf)) {
        hasRef = property.items.anyOf.some((item) => isDefRef(item.$ref));
      }
    
      // Check direct oneOf with $ref
      if (property.oneOf && Array.isArray(property.oneOf)) {
        hasRef = property.oneOf.some((item) => isDefRef(item.$ref));
      }
      // Check items.oneOf with $ref for arrays
      if (property.items && property.items.oneOf && Array.isArray(property.items.oneOf)) {
        hasRef = property.items.oneOf.some((item) => isDefRef(item.$ref));
      }
    
      // Check direct allOf with $ref
      if (property.allOf && Array.isArray(property.allOf)) {
        hasRef = property.allOf.some((item) => isDefRef(item.$ref));
      }
      // Check items.allOf with $ref for arrays
      if (property.items && property.items.allOf && Array.isArray(property.items.allOf)) {
        hasRef = property.items.allOf.some((item) => isDefRef(item.$ref));
      }
    
      // Check direct $ref
      hasRef = hasRef || isDefRef(property.$ref);
    
      // Special case: if the property has oneOf/anyOf/allOf at the items level
      // and is an array type, we should preserve the type
      if (property.type === "array" && property.items && (property.items.oneOf || property.items.anyOf || property.items.allOf)) {
        return false;
      }
    
      return hasRef;
    };
    

    const generateItems = (items) => {
      if (Array.isArray(items)) {
        return items.map((item) => generateItems(item));
      }

      if (items.type === "object") {
        const properties = generateProperties(items.properties || []);
        const result = {};

        if (Object.keys(properties).length > 0) {
          result.properties = properties;
        }

        if (Array.isArray(items.properties) && items.properties.length > 0) {
          const requiredProps = items.properties
            .filter((prop) => prop && prop.required)
            .map((prop) => prop.name);

          if (requiredProps.length > 0) {
            result.required = requiredProps;
          }
        }

        const limitDisclosureValue = shouldAddLimitDisclosure(items);
        if (limitDisclosureValue !== undefined) {
          result.limitDisclosure = limitDisclosureValue;
        }

        // Copy over properties except type if it has a definition reference
        for (const key in items) {
          if (!["properties", "required", "limitDisclosure"].includes(key)) {
            if (!(hasDefinitionReference(items) && key === "type")) {
              result[key] = items[key];
            }
          }
        }

        return result;
      }

      return items;
    };

    const generateProperties = (properties) => {
      if (!Array.isArray(properties)) {
        return {};
      }
    
      return properties.reduce((acc, property) => {
        if (!property || !property.name) return acc;
    
        acc[property.name] = {};
    
        // Check if this property has a reference to $defs or definitions
        const skipTypeField = hasDefinitionReference(property);
    
        // Copy over non-UI fields
        for (const key in property) {
          if (
            ![
              "name",
              "required",
              "properties",
              "items",
              "limitDisclosure",
              "additionalProperties",
            ].includes(key)
          ) {
            if (!(skipTypeField && key === "type")) {
              acc[property.name][key] = property[key];
            }
          }
        }
    
        const limitDisclosureValue = shouldAddLimitDisclosure(property);
        if (limitDisclosureValue !== undefined) {
          acc[property.name].limitDisclosure = limitDisclosureValue;
        }
    
        if (property.type === "object") {
          const propertyArray = Array.isArray(property.properties)
            ? property.properties
            : [];
    
          const generatedProperties = generateProperties(propertyArray);
    
          if (Object.keys(generatedProperties).length > 0) {
            acc[property.name].properties = generatedProperties;
          }
    
          if (propertyArray.length > 0) {
            const requiredFields = propertyArray
              .filter((prop) => prop && prop.required)
              .map((prop) => prop.name);
    
            if (requiredFields.length > 0) {
              acc[property.name].required = requiredFields;
            }
          }
    
          if (
            property.additionalProperties !== undefined &&
            credentialFormatValue !== "mso_mdoc"
          ) {
            acc[property.name].additionalProperties = property.additionalProperties;
          }
        } else if (property.type === "array") {
          acc[property.name].type = "array"; // Explicitly set type for arrays
          acc[property.name].items = generateItems(property.items || { type: "string" });
        }
    
        // Preserve oneOf, anyOf, allOf and $ref
        if (property.oneOf) acc[property.name].oneOf = property.oneOf;
        if (property.anyOf) acc[property.name].anyOf = property.anyOf;
        if (property.allOf) acc[property.name].allOf = property.allOf;
        if (property.$ref) acc[property.name].$ref = property.$ref;
    
        return acc;
      }, {});
    };

    // Start with the original schema structure, preserve both $defs and definitions
    const schema = {
      ...(window._originalSchema || {}),
      type: "object",
      properties: generateProperties(sections),
    };

    const hasAdditionalProperties = sections.some(
      (section) => section?.additionalProperties !== undefined
    );

    if (credentialFormatValue !== "mso_mdoc" && hasAdditionalProperties) {
      const additionalPropertiesValue = sections.find(
        (section) => section?.additionalProperties !== undefined
      )?.additionalProperties;
      schema.additionalProperties = additionalPropertiesValue;
    }

    if (Array.isArray(sections) && sections.length > 0) {
      const requiredFields = sections
        .filter((section) => section && section.required)
        .map((section) => section.name);

      if (requiredFields.length > 0) {
        schema.required = requiredFields;
      }
    }

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
    }
  }, [watchCredentialDefinition, watch("credentialFormat")]);

  const updateLimitDisclosure = (schema, newValue) => {
    const traverseAndUpdate = (obj) => {
      if (typeof obj === "object" && obj !== null) {
        Object.keys(obj).forEach((key) => {
          if (key === "limitDisclosure") {
            obj[key] = newValue;
          }
          traverseAndUpdate(obj[key]);
        });
      } else if (Array.isArray(obj)) {
        obj.forEach((item) => traverseAndUpdate(item));
      }
    };

    const updatedSchema = JSON.parse(JSON.stringify(schema));
    traverseAndUpdate(updatedSchema);
    return updatedSchema;
  };

  const handleCredentialFormatValueChange = (event) => {
    const isChecked = event.target.checked;
    setValue("credentialFormat", isChecked);

    const currentJsonSchema = JSON.parse(watch("jsonSchema"));

    if (Object.keys(currentJsonSchema.properties || {}).length === 0) {
      return;
    }

    const updatedJsonSchema = updateLimitDisclosure(
      currentJsonSchema,
      isChecked
    );

    setValue("jsonSchema", JSON.stringify(updatedJsonSchema, null, 2));

    try {
      const newSections = parseSchema(updatedJsonSchema, isChecked);
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

    if (!hasLimitDisclosure) {
      setValue("credentialFormat", false);
      return;
    }

    if (hasFalseValue) {
      setValue("credentialFormat", false);
    }
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

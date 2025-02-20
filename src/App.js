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
        ...(parsedSchema.additionalProperties !== undefined && {
          additionalProperties: parsedSchema.additionalProperties,
        }),

        // Store any other top-level properties that aren't being handled
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

        // Add type only if it's present in the original property
        if (property.type !== undefined) {
          parsedProperty.type = property.type;
        }

        // Add limitDisclosure only if explicitly defined and format is not jwt
        const limitDisclosureValue = shouldAddLimitDisclosure(property);
        if (limitDisclosureValue !== undefined) {
          parsedProperty.limitDisclosure = limitDisclosureValue;
        }

        // Handle nested properties and arrays
        if (property.type === "object") {
          // Don't delete properties from the original
          delete parsedProperty.properties;
          parsedProperty.properties = parseProperties(
            property.properties || {},
            property.required || []
          );

          // Preserve additionalProperties
          if (
            property.additionalProperties !== undefined &&
            credentialFormatValue !== "mso_mdoc"
          ) {
            parsedProperty.additionalProperties = property.additionalProperties;
          }
        } else if (property.type === "array") {
          // Don't delete items from the original
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

      if (items.type === "object") {
        const itemsWithoutLimitDisclosure = { ...items };
        delete itemsWithoutLimitDisclosure.limitDisclosure;

        const parsedItem = {
          ...itemsWithoutLimitDisclosure,
        };

        // Add type only if it exists in the original items
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

      // Only add type if it exists in the original property
      if (property.type !== undefined) {
        parsedProperty.type = property.type;
      }

      if (property.type === "object") {
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
      } else if (property.type === "array") {
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

  const generateJsonSchema = (
    sections,
    credentialFormatValue,
    additionalProperties
  ) => {
    const shouldAddLimitDisclosure = (property) => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };

    const generateItems = (items) => {
      if (Array.isArray(items)) {
        return {
          type: "array",
          items: items.map((item) => generateItems(item)),
        };
      }

      if (items.type === "object") {
        const generatedItem = {
          ...items,
          properties: generateProperties(items.properties || []),
        };

        // Only add type if it exists in the original items
        if (items.type !== undefined) {
          generatedItem.type = items.type;
        }

        if (Array.isArray(items.properties) && items.properties.length > 0) {
          const requiredProps = items.properties
            .filter((prop) => prop && prop.required)
            .map((prop) => prop.name);

          if (requiredProps.length > 0) {
            generatedItem.required = requiredProps;
          }
        }

        const limitDisclosureValue = shouldAddLimitDisclosure(items);
        if (limitDisclosureValue !== undefined) {
          generatedItem.limitDisclosure = limitDisclosureValue;
        }

        return generatedItem;
      }

      return items;
    };

    const generateProperties = (properties) => {
      if (!Array.isArray(properties)) {
        return {};
      }

      return properties.reduce((acc, property) => {
        if (!property || !property.name) return acc;

        acc[property.name] = {
          ...Object.fromEntries(
            Object.entries(property).filter(
              ([key]) =>
                ![
                  "name",
                  "type",
                  "properties",
                  "items",
                  "required",
                  "limitDisclosure",
                  "additionalProperties",
                ].includes(key)
            )
          ),
        };

        // Only add type if it exists in the original property
        if (property.type !== undefined) {
          acc[property.name].type = property.type;
        }

        const limitDisclosureValue = shouldAddLimitDisclosure(property);
        if (limitDisclosureValue !== undefined) {
          acc[property.name].limitDisclosure = limitDisclosureValue;
        }

        if (property.type === "object") {
          const propertyArray = Array.isArray(property.properties)
            ? property.properties
            : [];

          acc[property.name].properties = generateProperties(propertyArray);

          if (propertyArray.length > 0) {
            const requiredFields = propertyArray
              .filter((prop) => prop && prop.required)
              .map((prop) => prop.name);

            if (requiredFields.length > 0) {
              acc[property.name].required = requiredFields;
            }
          }
        } else if (property.type === "array") {
          acc[property.name].items = generateItems(
            property.items || { type: "string" }
          );
        }

        return acc;
      }, {});
    };

    const schema = {
      ...(window._originalSchema || {}),
      type: "object",
      properties: generateProperties(sections),
    };

    // Check if any section has additionalProperties defined
    const hasAdditionalProperties = sections.some(
      (section) => section?.additionalProperties !== undefined
    );

    // Only include additionalProperties if it was explicitly defined in sections

    if (credentialFormatValue !== "mso_mdoc" && hasAdditionalProperties) {
      // Use the first defined additionalProperties value
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

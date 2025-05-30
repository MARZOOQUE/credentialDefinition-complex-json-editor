import React, { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import MonacoEditor from "react-monaco-editor";
import "./App.css";

const App = () => {
  const { register, control, handleSubmit, setValue, watch, getValues } =
    useForm({
      defaultValues: {
        name: "",
        MultipleCredentialConfigurations: [],
      },
    });

  const [modalOpen, setModalOpen] = useState(false);
  const [currentConfigIndex, setCurrentConfigIndex] = useState(null);
  const [editorValue, setEditorValue] = useState("{}");
  const [editorError, setEditorError] = useState(null);

  const {
    fields: configFields,
    append: appendConfig,
    remove: removeConfig,
  } = useFieldArray({
    control,
    name: "MultipleCredentialConfigurations",
  });

  const addNewConfiguration = () => {
    const newConfig = {
      credentialDefinition: [], // Start with empty array
      jsonSchema: "{}",
      credentialFormat: false, // Start with false
    };
    appendConfig(newConfig);
    // Reset the current config index to null to ensure a fresh start
    setCurrentConfigIndex(null);
  };

  const openModal = (index) => {
    setCurrentConfigIndex(index);
    const currentConfig = getValues(
      `MultipleCredentialConfigurations.${index}`
    );
    // Ensure we have a valid JSON string
    const jsonSchema = currentConfig.jsonSchema || "{}";
    try {
      // Validate and format the JSON
      const parsed = JSON.parse(jsonSchema);
      setEditorValue(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.error("Invalid JSON in schema:", e);
      setEditorValue("{}");
    }
    setEditorError(null);
    setModalOpen(true);
  };

  const selectConfiguration = (index) => {
    setCurrentConfigIndex(index);
  };

  const closeModal = () => {
    // Update jsonSchema only when closing the modal
    if (currentConfigIndex !== null) {
      try {
        const parsedSchema = JSON.parse(editorValue);
        setValue(
          `MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema`,
          editorValue
        );

        // Store the original schema for later use
        window._originalSchema = {
          $schema: parsedSchema.$schema,
          title: parsedSchema.title,
          description: parsedSchema.description,
          allOf: parsedSchema.allOf,
          required: parsedSchema.required,
          type: parsedSchema.type,
          ...(parsedSchema.additionalProperties !== undefined && {
            additionalProperties: parsedSchema.additionalProperties,
          }),
          ...Object.fromEntries(
            Object.entries(parsedSchema).filter(
              ([key]) => !["properties", "additionalProperties"].includes(key)
            )
          ),
        };

        const currentCredentialFormat = watch(
          `MultipleCredentialConfigurations.${currentConfigIndex}.credentialFormat`
        );
        const newSections = parseSchema(parsedSchema, currentCredentialFormat);

        // Ensure we're setting an array even if newSections is empty
        setValue(
          `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition`,
          Array.isArray(newSections) ? newSections : []
        );

        // Force a re-render by updating the JSON schema
        updateJsonSchemaFromCredentialDefinition(currentConfigIndex);
      } catch (e) {
        console.error("Invalid JSON schema", e);
        setEditorError("Invalid JSON: " + e.message);
        return; // Don't close modal if there's an error
      }
    }

    setModalOpen(false);
    setCurrentConfigIndex(null);
    setEditorValue("{}");
    setEditorError(null);
  };

  const handleJsonSchemaChange = (newValue) => {
    // Only update the editor value, don't update the form or parse the schema
    setEditorValue(newValue);

    // Validate JSON to show errors in real-time
    try {
      JSON.parse(newValue);
      setEditorError(null);
    } catch (e) {
      setEditorError("Invalid JSON: " + e.message);
    }
  };

  const detectSchemaType = (schemaObj) => {
    if (schemaObj.type) {
      return schemaObj.type;
    }

    if (schemaObj.anyOf || schemaObj.oneOf || schemaObj.allOf) {
      return "object";
    }

    if (schemaObj.$ref) {
      return "object";
    }

    if (schemaObj.properties) {
      return "object";
    }
    if (schemaObj.items) {
      return "array";
    }

    return "string";
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

    // Handle empty or invalid schema
    if (!schema || !schema.properties) {
      return [];
    }

    const result = Object.keys(schema.properties).map((key) => {
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
    // If we have no sections but have original schema, use that
    if ((!sections || sections.length === 0) && window._originalSchema) {
      return window._originalSchema;
    }

    // If we have no sections, return a basic schema
    if (!sections || sections.length === 0) {
      return {
        type: "object",
        properties: {},
        required: [],
      };
    }

    const shouldAddLimitDisclosure = (property) => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };

    const generateProperties = (properties) => {
      if (!Array.isArray(properties)) {
        return {};
      }

      return properties.reduce((acc, property) => {
        if (!property || !property.name) return acc;

        acc[property.name] = {
          type: property.type || "string",
        };

        // Add limitDisclosure if it exists
        const limitDisclosureValue = shouldAddLimitDisclosure(property);
        if (limitDisclosureValue !== undefined) {
          acc[property.name].limitDisclosure = limitDisclosureValue;
        }

        // Handle object type
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
              .map((prop) => prop.name)
              .filter(Boolean);

            if (requiredFields.length > 0) {
              acc[property.name].required = requiredFields;
            }
          }

          if (
            property.additionalProperties !== undefined &&
            credentialFormatValue !== "mso_mdoc"
          ) {
            acc[property.name].additionalProperties =
              property.additionalProperties;
          }
        }
        // Handle array type
        else if (property.type === "array") {
          acc[property.name].items = generateItems(
            property.items || { type: "string" }
          );
        }

        // Add any additional properties
        for (const key in property) {
          if (
            ![
              "name",
              "required",
              "properties",
              "items",
              "limitDisclosure",
              "additionalProperties",
              "type",
            ].includes(key)
          ) {
            acc[property.name][key] = property[key];
          }
        }

        return acc;
      }, {});
    };

    const generateItems = (items) => {
      if (Array.isArray(items)) {
        return items.map((item) => generateItems(item));
      }

      if (items.type === "object") {
        const properties = generateProperties(items.properties || []);
        const result = {
          type: "object",
          properties: properties,
        };

        if (Object.keys(properties).length > 0) {
          const requiredFields = Object.keys(properties)
            .filter(
              (key) => items.properties?.find((p) => p.name === key)?.required
            )
            .filter(Boolean);

          if (requiredFields.length > 0) {
            result.required = requiredFields;
          }
        }

        const limitDisclosureValue = shouldAddLimitDisclosure(items);
        if (limitDisclosureValue !== undefined) {
          result.limitDisclosure = limitDisclosureValue;
        }

        return result;
      }

      return {
        type: items.type || "string",
      };
    };

    // Generate the schema
    const schema = {
      type: "object",
      properties: generateProperties(sections),
    };

    // Add required fields
    const requiredFields = sections
      .filter((section) => section && section.required)
      .map((section) => section.name)
      .filter(Boolean);

    if (requiredFields.length > 0) {
      schema.required = requiredFields;
    }

    // Add additional properties if needed
    const hasAdditionalProperties = sections.some(
      (section) => section?.additionalProperties !== undefined
    );

    if (credentialFormatValue !== "mso_mdoc" && hasAdditionalProperties) {
      const additionalPropertiesValue = sections.find(
        (section) => section?.additionalProperties !== undefined
      )?.additionalProperties;
      schema.additionalProperties = additionalPropertiesValue;
    }

    return schema;
  };

  const watchCurrentCredentialDefinition = watch(
    currentConfigIndex !== null
      ? `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition`
      : "temp"
  );
  const watchCurrentCredentialFormat = watch(
    currentConfigIndex !== null
      ? `MultipleCredentialConfigurations.${currentConfigIndex}.credentialFormat`
      : "temp"
  );

  const updateJsonSchemaFromCredentialDefinition = (configIndex) => {
    if (configIndex === undefined) {
      configIndex = currentConfigIndex;
    }
    if (configIndex === null) return;

    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition`
    );
    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialFormat`
    );

    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    setValue(
      `MultipleCredentialConfigurations.${configIndex}.jsonSchema`,
      newJsonSchemaString
    );
  };

  const handleTypeChange = (configIndex, fieldIndex, value) => {
    console.log("Type change:", { configIndex, fieldIndex, value });

    // Update the type in the form
    setValue(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition.${fieldIndex}.type`,
      value
    );

    // Get the current credential definition
    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition`
    );
    console.log("Current credential definition:", currentCredentialDefinition);

    // Update the JSON schema immediately
    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialFormat`
    );
    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);
    console.log("New JSON schema:", newJsonSchemaString);

    // Update the JSON schema in the form
    setValue(
      `MultipleCredentialConfigurations.${configIndex}.jsonSchema`,
      newJsonSchemaString
    );
  };

  const handleNameChange = (configIndex, fieldIndex, value) => {
    console.log("Name change:", { configIndex, fieldIndex, value });

    // Update the name in the form
    setValue(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition.${fieldIndex}.name`,
      value
    );

    // Get the current credential definition
    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition`
    );
    console.log("Current credential definition:", currentCredentialDefinition);

    // Update the JSON schema immediately
    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialFormat`
    );
    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);
    console.log("New JSON schema:", newJsonSchemaString);

    // Update the JSON schema in the form
    setValue(
      `MultipleCredentialConfigurations.${configIndex}.jsonSchema`,
      newJsonSchemaString
    );
  };

  const handleRequiredChange = (index, checked) => {
    if (currentConfigIndex === null) return;

    // First update the required status
    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition.${index}.required`,
      checked
    );

    // Get the current credential definition
    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition`
    );

    // Update the JSON schema immediately
    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialFormat`
    );
    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    // Update the JSON schema in the form
    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema`,
      newJsonSchemaString
    );
  };

  const handleCredentialFormatValueChange = (event) => {
    if (currentConfigIndex === null) return;

    const isChecked = event.target.checked;
    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialFormat`,
      isChecked
    );

    const currentJsonSchema = JSON.parse(
      watch(`MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema`)
    );

    if (Object.keys(currentJsonSchema.properties || {}).length === 0) {
      return;
    }

    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema`,
      JSON.stringify(currentJsonSchema, null, 2)
    );

    try {
      const newSections = parseSchema(currentJsonSchema, isChecked);
      setValue(
        `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition`,
        newSections
      );
    } catch (e) {
      console.error("Invalid JSON schema", e);
    }
  };

  const updateCredentialFormatValue = (jsonData, configIndex) => {
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
      setValue(
        `MultipleCredentialConfigurations.${configIndex}.credentialFormat`,
        false
      );
      return;
    }

    if (hasFalseValue) {
      setValue(
        `MultipleCredentialConfigurations.${configIndex}.credentialFormat`,
        false
      );
    }
  };

  const addNewSection = (configIndex) => {
    console.log("Adding new section for config index:", configIndex);

    // Get current credential definition
    const currentCredentialDefinition =
      getValues(
        `MultipleCredentialConfigurations.${configIndex}.credentialDefinition`
      ) || [];

    // Create new section
    const newSection = {
      name: "",
      type: "string",
      properties: [],
      items: {},
      required: true,
      limitDisclosure: watch(
        `MultipleCredentialConfigurations.${configIndex}.credentialFormat`
      ),
    };

    // Update the credential definition with the new section
    setValue(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition`,
      [...currentCredentialDefinition, newSection]
    );

    // Update JSON schema with the specific config index
    setTimeout(() => updateJsonSchemaFromCredentialDefinition(configIndex), 0);
  };

  return (
    <div className="app-container">
      <form onSubmit={handleSubmit(() => {})}>
        {/* Main Name Field */}
        <div className="name-container">
          <label>Configuration Name:</label>
          <input
            {...register("name")}
            placeholder="Enter configuration name"
            className="input-field"
          />
        </div>

        {/* Multiple Credential Configurations */}
        <div className="configurations-container">
          <div className="configurations-header">
            <h3>Multiple Credential Configurations</h3>
            <button
              type="button"
              className="add-config-button"
              onClick={addNewConfiguration}
            >
              Add Configuration
            </button>
          </div>

          <div className="configurations-list">
            {configFields.map((field, index) => (
              <div key={field.id} className="config-item">
                <div className="config-header">
                  <h3>Configuration {index + 1}</h3>
                  <div className="config-actions">
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => openModal(index)}
                    >
                      Edit Schema
                    </button>
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => removeConfig(index)}
                    >
                      Remove Config
                    </button>
                  </div>
                </div>

                <div className="config-details">
                  <div className="checkbox-container">
                    <label>
                      <input
                        type="checkbox"
                        {...register(
                          `MultipleCredentialConfigurations.${index}.credentialFormat`
                        )}
                        onChange={(e) => {
                          setCurrentConfigIndex(index);
                          handleCredentialFormatValueChange(e);
                        }}
                        checked={watch(
                          `MultipleCredentialConfigurations.${index}.credentialFormat`
                        )}
                      />
                      Limit Disclosure
                    </label>
                  </div>

                  <button
                    type="button"
                    className="add-section-button"
                    onClick={() => addNewSection(index)}
                  >
                    Add Section
                  </button>

                  <ul className="fields-list">
                    {watch(
                      `MultipleCredentialConfigurations.${index}.credentialDefinition`
                    )?.map((field, fieldIndex) => (
                      <li key={fieldIndex} className="field-item">
                        <input
                          value={
                            watch(
                              `MultipleCredentialConfigurations.${index}.credentialDefinition.${fieldIndex}.name`
                            ) || ""
                          }
                          onChange={(e) =>
                            handleNameChange(index, fieldIndex, e.target.value)
                          }
                          placeholder="Input Name"
                          className="input-field"
                        />
                        <select
                          value={
                            watch(
                              `MultipleCredentialConfigurations.${index}.credentialDefinition.${fieldIndex}.type`
                            ) || "string"
                          }
                          onChange={(e) =>
                            handleTypeChange(index, fieldIndex, e.target.value)
                          }
                          className="select-field"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="object">object</option>
                          <option value="array">array</option>
                        </select>
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              watch(
                                `MultipleCredentialConfigurations.${index}.credentialDefinition.${fieldIndex}.required`
                              ) || false
                            }
                            onChange={(e) =>
                              handleRequiredChange(
                                index,
                                fieldIndex,
                                e.target.checked
                              )
                            }
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const currentCredentialDefinition =
                              getValues(
                                `MultipleCredentialConfigurations.${index}.credentialDefinition`
                              ) || [];
                            const updatedDefinition =
                              currentCredentialDefinition.filter(
                                (_, i) => i !== fieldIndex
                              );
                            setValue(
                              `MultipleCredentialConfigurations.${index}.credentialDefinition`,
                              updatedDefinition
                            );
                            setTimeout(
                              () =>
                                updateJsonSchemaFromCredentialDefinition(index),
                              0
                            );
                          }}
                          className="remove-button"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Modal for JSON Schema Editor */}
        {modalOpen && currentConfigIndex !== null && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  JSON Schema Editor - Configuration {currentConfigIndex + 1}
                </h3>
                <button className="close-button" onClick={closeModal}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="editor-container">
                  <label>JSON Schema Editor:</label>
                  {editorError && (
                    <div className="error-message">{editorError}</div>
                  )}
                  <div className="editor-wrapper">
                    <MonacoEditor
                      width="700"
                      height="500"
                      language="json"
                      theme="vs-dark"
                      value={editorValue}
                      onChange={handleJsonSchemaChange}
                      options={{
                        selectOnLineNumbers: true,
                        minimap: { enabled: false },
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="save-button"
                  onClick={closeModal}
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default App;

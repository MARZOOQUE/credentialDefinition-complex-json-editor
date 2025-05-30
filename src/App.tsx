import React, { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import MonacoEditor from "react-monaco-editor";
import "./App.css";


const App: React.FC = () => {
  const { register, control, handleSubmit, setValue, watch, getValues } =
    useForm<any>({
      defaultValues: {
        name: "",
        MultipleCredentialConfigurations: [],
      },
    });

  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [currentConfigIndex, setCurrentConfigIndex] = useState<number | null>(null);
  const [editorValue, setEditorValue] = useState<string>("{}");
  const [editorError, setEditorError] = useState<string | null>(null);

  const {
    fields: configFields,
    append: appendConfig,
    remove: removeConfig,
  } = useFieldArray<any>({
    control,
    name: "MultipleCredentialConfigurations",
  });

  const addNewConfiguration = (): void => {
    const newConfig: any = {
      credentialDefinition: [],
      jsonSchema: "{}",
      credentialFormat: false,
    };
    appendConfig(newConfig);
    setCurrentConfigIndex(null);
  };

  const openModal = (index: number): void => {
    setCurrentConfigIndex(index);
    const currentConfig = getValues(`MultipleCredentialConfigurations.${index}`);
    const jsonSchema = currentConfig?.jsonSchema || "{}";
    try {
      const parsed = JSON.parse(jsonSchema);
      setEditorValue(JSON.stringify(parsed, null, 2));
    } catch (e: any) {
      console.error("Invalid JSON in schema:", e);
      setEditorValue("{}");
    }
    setEditorError(null);
    setModalOpen(true);
  };

  const closeModal = (): void => {
    if (currentConfigIndex === null) return;

    try {
      const parsedSchema = JSON.parse(editorValue);
      setValue(
        `MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema` as const,
        editorValue
      );

      (window as any)._originalSchema = {
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
        `MultipleCredentialConfigurations.${currentConfigIndex}.credentialFormat` as const
      );
      const newSections = parseSchema(parsedSchema, currentCredentialFormat);

      setValue(
        `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition` as const,
        Array.isArray(newSections) ? newSections : []
      );

      updateJsonSchemaFromCredentialDefinition(currentConfigIndex);
    } catch (e: any) {
      console.error("Invalid JSON schema", e);
      setEditorError("Invalid JSON: " + e.message);
      return;
    }

    setModalOpen(false);
    setCurrentConfigIndex(null);
    setEditorValue("{}");
    setEditorError(null);
  };

  const handleJsonSchemaChange = (newValue: string): void => {
    // Only update the editor value, don't update the form or parse the schema
    setEditorValue(newValue);

    // Validate JSON to show errors in real-time
    try {
      JSON.parse(newValue);
      setEditorError(null);
    } catch (e: any) {
      setEditorError("Invalid JSON: " + e.message);
    }
  };

  const detectSchemaType = (schemaObj: any): string => {
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

  const parseSchema = (schema: any, credentialFormatValue: any): any => {
    const shouldAddLimitDisclosure = (property: any): any => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };

    const parseProperties = (properties: any, requiredFields: any): any => {
      return Object.keys(properties).map((key: string) => {
        const property: any = properties[key];
        const propertyWithoutLimitDisclosure: any = { ...property };
        delete propertyWithoutLimitDisclosure.limitDisclosure;

        const parsedProperty: any = {
          ...propertyWithoutLimitDisclosure,
          name: key,
          required:
            Array.isArray(requiredFields) && requiredFields.includes(key),
        };

        if (!property.type) {
          try {
            parsedProperty.type = detectSchemaType(property);
          } catch (err: any) {
            console.warn(`Could not detect type for property ${key}:`, err);
            parsedProperty.type = "string";
          }
        } else {
          parsedProperty.type = property.type;
        }

        const limitDisclosureValue: any = shouldAddLimitDisclosure(property);
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

    const parseItems = (items: any): any => {
      if (Array.isArray(items)) {
        return {
          type: "array",
          items: items.map((item: any) => parseItems(item)),
        };
      }

      if (!items.type) {
        try {
          items.type = detectSchemaType(items);
        } catch (err: any) {
          console.warn("Could not detect type for array items:", err);
          items.type = "string";
        }
      }

      if (items.type === "object") {
        const itemsWithoutLimitDisclosure: any = { ...items };
        delete itemsWithoutLimitDisclosure.limitDisclosure;

        const parsedItem: any = {
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

        const limitDisclosureValue: any = shouldAddLimitDisclosure(items);
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

    const result: any = Object.keys(schema.properties).map((key: string) => {
      const property: any = schema.properties[key];
      const propertyWithoutLimitDisclosure: any = { ...property };
      delete propertyWithoutLimitDisclosure.limitDisclosure;

      const parsedProperty: any = {
        ...propertyWithoutLimitDisclosure,
        name: key,
        required: schema.required ? schema.required.includes(key) : false,
      };

      if (!property.type) {
        try {
          parsedProperty.type = detectSchemaType(property);
        } catch (err: any) {
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

      const limitDisclosureValue: any = shouldAddLimitDisclosure(property);
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

  const generateJsonSchema = (sections: any, credentialFormatValue: any): any => {
    // If we have no sections but have original schema, use that
    if ((!sections || sections.length === 0) && (window as any)._originalSchema) {
      return (window as any)._originalSchema;
    }

    // If we have no sections, return a basic schema
    if (!sections || sections.length === 0) {
      return {
        type: "object",
        properties: {},
        required: [],
      };
    }

    const shouldAddLimitDisclosure = (property: any): any => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };

    const generateProperties = (properties: any): any => {
      if (!Array.isArray(properties)) {
        return {};
      }

      return properties.reduce((acc: any, property: any) => {
        if (!property || !property.name) return acc;

        acc[property.name] = {
          type: property.type || "string",
        };

        // Add limitDisclosure if it exists
        const limitDisclosureValue: any = shouldAddLimitDisclosure(property);
        if (limitDisclosureValue !== undefined) {
          acc[property.name].limitDisclosure = limitDisclosureValue;
        }

        // Handle object type
        if (property.type === "object") {
          const propertyArray: any = Array.isArray(property.properties)
            ? property.properties
            : [];

          const generatedProperties: any = generateProperties(propertyArray);

          if (Object.keys(generatedProperties).length > 0) {
            acc[property.name].properties = generatedProperties;
          }

          if (propertyArray.length > 0) {
            const requiredFields: any = propertyArray
              .filter((prop: any) => prop && prop.required)
              .map((prop: any) => prop.name)
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

    const generateItems = (items: any): any => {
      if (Array.isArray(items)) {
        return items.map((item: any) => generateItems(item));
      }

      if (items.type === "object") {
        const properties: any = generateProperties(items.properties || []);
        const result: any = {
          type: "object",
          properties: properties,
        };

        if (Object.keys(properties).length > 0) {
          const requiredFields: any = Object.keys(properties)
            .filter(
              (key: string) => items.properties?.find((p: any) => p.name === key)?.required
            )
            .filter(Boolean);

          if (requiredFields.length > 0) {
            result.required = requiredFields;
          }
        }

        const limitDisclosureValue: any = shouldAddLimitDisclosure(items);
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
    const schema: any = {
      type: "object",
      properties: generateProperties(sections),
    };

    // Add required fields
    const requiredFields: any = sections
      .filter((section: any) => section && section.required)
      .map((section: any) => section.name)
      .filter(Boolean);

    if (requiredFields.length > 0) {
      schema.required = requiredFields;
    }

    // Add additional properties if needed
    const hasAdditionalProperties: boolean = sections.some(
      (section: any) => section?.additionalProperties !== undefined
    );

    if (credentialFormatValue !== "mso_mdoc" && hasAdditionalProperties) {
      const additionalPropertiesValue: any = sections.find(
        (section: any) => section?.additionalProperties !== undefined
      )?.additionalProperties;
      schema.additionalProperties = additionalPropertiesValue;
    }

    return schema;
  };

  const updateJsonSchemaFromCredentialDefinition = (configIndex: number): void => {
    if (configIndex === null) return;

    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition` as const
    );
    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialFormat` as const
    );

    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    setValue(
      `MultipleCredentialConfigurations.${configIndex}.jsonSchema` as const,
      newJsonSchemaString
    );
  };

  const handleTypeChange = (configIndex: number, fieldIndex: number, value: string): void => {
    setValue(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition.${fieldIndex}.type` as const,
      value
    );

    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition` as const
    );

    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialFormat` as const
    );
    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    setValue(
      `MultipleCredentialConfigurations.${configIndex}.jsonSchema` as const,
      newJsonSchemaString
    );
  };

  const handleNameChange = (configIndex: number, fieldIndex: number, value: string): void => {
    setValue(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition.${fieldIndex}.name` as const,
      value
    );

    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition` as const
    );

    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialFormat` as const
    );
    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    setValue(
      `MultipleCredentialConfigurations.${configIndex}.jsonSchema` as const,
      newJsonSchemaString
    );
  };

  const handleRequiredChange = (index: number, fieldIndex: number, checked: boolean): void => {
    if (currentConfigIndex === null) return;

    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition.${fieldIndex}.required` as const,
      checked
    );

    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition` as const
    );

    const currentCredentialFormat = getValues(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialFormat` as const
    );
    const newJsonSchema = generateJsonSchema(
      currentCredentialDefinition,
      currentCredentialFormat
    );
    const newJsonSchemaString = JSON.stringify(newJsonSchema, null, 2);

    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema` as const,
      newJsonSchemaString
    );
  };

  const handleCredentialFormatValueChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    if (currentConfigIndex === null) return;

    const isChecked = event.target.checked;
    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.credentialFormat` as const,
      isChecked
    );

    const currentJsonSchema = JSON.parse(
      watch(`MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema` as const)
    );

    if (Object.keys(currentJsonSchema.properties || {}).length === 0) {
      return;
    }

    setValue(
      `MultipleCredentialConfigurations.${currentConfigIndex}.jsonSchema` as const,
      JSON.stringify(currentJsonSchema, null, 2)
    );

    try {
      const newSections = parseSchema(currentJsonSchema, isChecked);
      setValue(
        `MultipleCredentialConfigurations.${currentConfigIndex}.credentialDefinition` as const,
        newSections
      );
    } catch (e: any) {
      console.error("Invalid JSON schema", e);
    }
  };

  const addNewSection = (configIndex: number): void => {
    const currentCredentialDefinition = getValues(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition` as const
    ) || [];

    const newSection: any = {
      name: "",
      type: "string",
      required: true,
      properties: [],
      items: {},
      limitDisclosure: watch(
        `MultipleCredentialConfigurations.${configIndex}.credentialFormat` as const
      ),
    };

    setValue(
      `MultipleCredentialConfigurations.${configIndex}.credentialDefinition` as const,
      [...currentCredentialDefinition, newSection]
    );

    setTimeout(() => updateJsonSchemaFromCredentialDefinition(configIndex), 0);
  };

  return (
    <div className="app-container">
      <form onSubmit={handleSubmit(() => {})}>
        <div className="name-container">
          <label>Configuration Name:</label>
          <input
            {...register("name")}
            placeholder="Enter configuration name"
            className="input-field"
          />
        </div>

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
                          `MultipleCredentialConfigurations.${index}.credentialFormat` as const
                        )}
                        onChange={(e) => {
                          setCurrentConfigIndex(index);
                          handleCredentialFormatValueChange(e);
                        }}
                        checked={watch(
                          `MultipleCredentialConfigurations.${index}.credentialFormat` as const
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
                      `MultipleCredentialConfigurations.${index}.credentialDefinition` as const
                    )?.map((field, fieldIndex) => (
                      <li key={fieldIndex} className="field-item">
                        <input
                          value={
                            watch(
                              `MultipleCredentialConfigurations.${index}.credentialDefinition.${fieldIndex}.name` as const
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
                              `MultipleCredentialConfigurations.${index}.credentialDefinition.${fieldIndex}.type` as const
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
                                `MultipleCredentialConfigurations.${index}.credentialDefinition.${fieldIndex}.required` as const
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
                            const currentCredentialDefinition = getValues(
                              `MultipleCredentialConfigurations.${index}.credentialDefinition` as const
                            ) || [];
                            const updatedDefinition = currentCredentialDefinition.filter(
                              (_, i) => i !== fieldIndex
                            );
                            setValue(
                              `MultipleCredentialConfigurations.${index}.credentialDefinition` as const,
                              updatedDefinition
                            );
                            setTimeout(
                              () => updateJsonSchemaFromCredentialDefinition(index),
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
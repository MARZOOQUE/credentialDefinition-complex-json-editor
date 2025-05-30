export const parseSchema = (
    schema: any,
    credentialFormatValue: string
  ): any[] => {
    const shouldAddLimitDisclosure = (property: any): boolean | undefined => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };
  
    const parseProperties = (
      properties: any,
      requiredFields: string[]
    ): any[] => {
      return Object.keys(properties).map((key) => {
        const property: any = properties[key];
        const propertyWithoutLimitDisclosure = { ...property };
        delete propertyWithoutLimitDisclosure.limitDisclosure;
  
        const parsedProperty: any = {
          ...propertyWithoutLimitDisclosure,
          name: key,
          required: Array.isArray(requiredFields) && requiredFields.includes(key),
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
          parsedProperty.items = parseItems(property.items || { type: "string" });
        }
  
        return parsedProperty;
      });
    };
  
    const parseItems = (items: any): any => {
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
      const property: any = schema.properties![key];
      const propertyWithoutLimitDisclosure = { ...property };
      delete propertyWithoutLimitDisclosure.limitDisclosure;
  
      const parsedProperty: any = {
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
      (result as any).additionalProperties = schema.additionalProperties;
    }
  
    return result;
  };
  
  declare const window: Window & {
    _originalSchema?: any;
  };
  
  export const generateJsonSchema = (
    sections: any[],
    credentialFormatValue: string
  ): any => {
    // If no sections are defined and we have the original schema, return it unchanged
    if ((!sections || sections.length === 0) && window._originalSchema) {
      return window._originalSchema;
    }
  
    const shouldAddLimitDisclosure = (property: any): any => {
      if (credentialFormatValue === "jwt") return undefined;
      return property.limitDisclosure !== undefined
        ? property.limitDisclosure
        : undefined;
    };
  
    const hasDefinitionReference = (property: any) => {
      const isDefRef = (ref: any) => {
        return (
          ref && (ref.startsWith("#/$defs/") || ref.startsWith("#/definitions/"))
        );
      };
  
      // Create a flag to track if we found a definition reference
      let hasRef = false;
  
      // Check direct anyOf with $ref
      if (property.anyOf && Array.isArray(property.anyOf)) {
        hasRef = property.anyOf.some((item: any) => isDefRef(item.$ref));
      }
      // Check items.anyOf with $ref for arrays
      if (
        property.items &&
        property.items.anyOf &&
        Array.isArray(property.items.anyOf)
      ) {
        hasRef = property.items.anyOf.some((item: any) => isDefRef(item.$ref));
      }
  
      // Check direct oneOf with $ref
      if (property.oneOf && Array.isArray(property.oneOf)) {
        hasRef = property.oneOf.some((item: any) => isDefRef(item.$ref));
      }
      // Check items.oneOf with $ref for arrays
      if (
        property.items &&
        property.items.oneOf &&
        Array.isArray(property.items.oneOf)
      ) {
        hasRef = property.items.oneOf.some((item: any) => isDefRef(item.$ref));
      }
  
      // Check direct allOf with $ref
      if (property.allOf && Array.isArray(property.allOf)) {
        hasRef = property.allOf.some((item: any) => isDefRef(item.$ref));
      }
      // Check items.allOf with $ref for arrays
      if (
        property.items &&
        property.items.allOf &&
        Array.isArray(property.items.allOf)
      ) {
        hasRef = property.items.allOf.some((item: any) => isDefRef(item.$ref));
      }
  
      // Check direct $ref
      hasRef = hasRef || isDefRef(property.$ref);
  
      // Special case: if the property has oneOf/anyOf/allOf at the items level
      // and is an array type, we should preserve the type
      if (
        property.type === "array" &&
        property.items &&
        (property.items.oneOf || property.items.anyOf || property.items.allOf)
      ) {
        return false;
      }
  
      return hasRef;
    };
  
    const generateItems = (items: any): any => {
      if (Array.isArray(items)) {
        return items.map((item) => generateItems(item));
      }
  
      if (items.type === "object") {
        const properties = generateProperties(items.properties || []);
        const result: any = {};
  
        if (Object.keys(properties).length > 0) {
          result.properties = properties;
        }
  
        if (Array.isArray(items.properties) && items.properties.length > 0) {
          const requiredProps = items.properties
            .filter((prop: any) => prop && prop.required)
            .map((prop: any) => prop.name);
  
          if (requiredProps.length > 0) {
            result.required = requiredProps;
          }
        }
  
        const limitDisclosureValue = shouldAddLimitDisclosure(items);
        if (limitDisclosureValue !== undefined) {
          result.limitDisclosure = limitDisclosureValue;
        }
  
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
  
    const generateProperties = (properties: any) => {
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
              .filter((prop: any) => prop && prop.required)
              .map((prop: any) => prop.name);
  
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
        } else if (property.type === "array") {
          acc[property.name].type = "array"; // Explicitly set type for arrays
          acc[property.name].items = generateItems(
            property.items || { type: "string" }
          );
        }
  
        // Preserve oneOf, anyOf, allOf and $ref
        if (property.oneOf) acc[property.name].oneOf = property.oneOf;
        if (property.anyOf) acc[property.name].anyOf = property.anyOf;
        if (property.allOf) acc[property.name].allOf = property.allOf;
        if (property.$ref) acc[property.name].$ref = property.$ref;
  
        return acc;
      }, {});
    };
  
    const schema: any = {
      ...(window._originalSchema || {}),
      type: "object",
      properties: generateProperties(sections),
    };
  
    const hasAdditionalProperties = sections.some(
      (section: any) => section?.additionalProperties !== undefined
    );
  
    if (credentialFormatValue !== "mso_mdoc" && hasAdditionalProperties) {
      const additionalPropertiesValue = sections.find(
        (section: any) => section?.additionalProperties !== undefined
      )?.additionalProperties;
      schema.additionalProperties = additionalPropertiesValue;
    }
  
    if (Array.isArray(sections) && sections.length > 0) {
      const requiredFields = sections
        .filter((section: any) => section && section.required)
        .map((section: any) => section.name);
  
      if (requiredFields.length > 0) {
        schema.required = requiredFields;
      }
    }
  
    return schema;
  };
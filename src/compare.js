<div className="app-container">
      <form >
        <div className="editor-container">
          <label>JSON Schema Editor:</label>
          <div className="editor-wrapper">
            <AceEditor
              mode="json"
              theme="tomorrow"
              onChange={}
              name="json-editor"
              editorProps={{ $blockScrolling: true }}
              value={}
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
        {/* ... rest of your component JSX ... */}
      </form>
    </div>
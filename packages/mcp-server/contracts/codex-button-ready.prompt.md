This is a read-only Hatchkit Agent contract test.

Do not use shell commands, file tools, web tools, or repository reads. Use only the configured `hatchkit` MCP server.

Perform these actions in order:

1. Call `hatchkit_status`.
2. Search for the exact Component named `Button` with `hatchkit_search_components`.
3. Resolve asset ID `button` with `appearance=secondary` and `state=disabled` using `hatchkit_resolve_component`.

Return only the JSON object required by the output schema. `mayWriteFigma` must state whether this read-only lookup, without current Approval and Figma audit verification, authorizes a Figma write.

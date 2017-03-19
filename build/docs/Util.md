# Util

## `glTypes`

This is a map containing type information about every `GLSL` type, indexed by name.

Namely, it provides you with the `GLSL` keyword, the `WebGL` type constant, the slot type, and the byte usage of the type.

## `buildVertexBuffer(struct, bufferData)`

This creates a new `VertexBufferObject`, fill it with `bufferData`, then creates a new `VertexArrayObject`, and set its `AttribPointers` by following the layout provided in `struct`

Returns `{vertexArray, vertexBuffer}`

## `buildShader(type, uniforms, inputs, outputs, code)`

This creates and compiles a shader, where `type` is one of `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`, `code` is the main code of your shader, and `uniforms`, `inputs`, and `outputs` are name/type maps that will be turned into `GLSL` declaration lists.

If a compilation error happens, it is logged through `console.warn`

## `buildProgram(vertexShader, fragmentShader)`

This creates and links a program, given one vertex shader and one fragment shader.

If a compilation or linking error happens, it is logged through `console.warn`.

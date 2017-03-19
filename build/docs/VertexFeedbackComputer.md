# VertexFeedbackComputer

## Introduction

You create a `VertexFeedbackComputer` by passing a `JSON` descriptor as an argument:
```javascript
new WGU.VertexFeedbackComputer({

	units: 100,
	struct: {
		position: "vec3"
	},
	updateStep: {
		params: {
			wind: "vec3"
		},
		glsl: `
			void main() {
				o_position = i_position + u_wind;
			}
		`
	},
	renderStep: {
		params: {
			color: "vec3"
		},
		glsl: `
			void main() {
				gl_Position = i_position;
				vertexColor = u_color;
			}
		`
	}

});
```

The purpose of each parameter is explained below.

## `units`

This tells `VertexFeedbackComputer` how many units to spawn.

`Structs` are stored together on the GPU as a single `VertexBuffer`, and while modern cards can go a very long way, asking for too many units can still hit either the `GL_MAX_ELEMENT_VERTICES` or `GL_OUT_OF_MEMORY` limit.

## `struct`

This is a description of the piece of state stored in each unit. You specify each field name (warning: order matters) and its type as follows :

```javascript
{
	"position": "vec2",
	"velocity": "vec2",
	"mass": "float",
	"color": "vec3",
}
```

This then gets mapped into native types as defined in [`Util.glTypes`](Util#glTypes)

!!! note
	Keep in mind [the peculiar way](https://www.khronos.org/opengl/wiki/Interface_Block_(GLSL)#Buffer_backed) in which OpenGL packs `varying`and `uniforms` on the card.

	Attributes use up `slots`, `slots` have different `types`, each `type` uses up a specific amount of `bytes`, there are composite types (e.g. `mat3`) that use up several `blocks`, `blocks`line up into `rows` (usually 4-`block` wide), and there is an overall `block` limit of `gl.MAX_VARYING_VECTORS`, which is usually 16.

	Because of that, it might be advantageous to pay attention to how your fields are getting packed `byte`- and `block`-wise, and to reorder fields so that they fall on a 4-`block` boundary, or to pack multiple related fields into a single `vec4`.

## `initialize`

This allows you to customize the starting data of the `VertexBuffer`. By default, it is filled with zeroes.

For performance reasons, a single `ArrayBuffer` containing all the vertices is used. This means you are going to write directly to the in-memory layout of the struct you defined.

To make your life slightly easier, `VertexFeedbackComputer` accepts a callback, and provides you with a sub-buffer pointing to the region of interest, and the current index of the unit :

```javascript
initialize: (i, buffer) => buffer.set([255, 172, 172]),
```

!!! warning
	You need to make sure that your call to `buffer.set` does not go out of bounds or fills the buffer with mismatched garbage.

Furthermore, `ArrayBuffers` handles `bytes`, but you often want to fill your buffer with `floats` instead (for instance, if your struct is made of `floats` and `vec2`).

You can convert a `Float32Array` to an `Uint8Array` like so :

```javascript
initialize: (i, buffer) => buffer.set(
	new Uint8Array(new Float32Array([0.5, -1.0, 0.5]).buffer)
),
```

Again, you can get more info about how many bytes each type uses up by looking up [`Util.glTypes`](Util#glTypes)

## `updateStep`

The update step is the `TransformFeedback` step, which is run entirely on the GPU.

It takes an input buffer that is read-only, and an output buffer that is write-only (this is what allows your GPU to run every vertex shader unit in parallel).

Every step, those two buffers get swapped around so that you work with the latest data and overwrite the oldest.

`VertexFeedbackComputer` generates the `varying` and `uniform` names for you automatically, using the following convention :

* `i_name`: value of the current struct's `name` field in the input buffer (to be read from)
* `o_name`: value of the current struct's `name` field in the output buffer (to be written to)
* `u_name`: value of the `name` global update parameter (to be read from)

An example would be:
```glsl
void main() {
	o_localPopulation = u_globalGrowth * i_localPopulation;
}
```

!!! warning
	You need to explicitely set every output field (even if its value is the same as the input field). Otherwise, the runtime compiler will optimize those away, resulting in compilation warnings and garbage values at runtime.

The `varying` and `uniform` declarations are prepended internally, thus you only have to provide the body of the shader, usually just a `main`, but splitting your code into separate functions and using defines is still possible :

```glsl
#define PI 3.141592

vec2 swap(vec2 i) {
	return i.yx;
}

void main() {
	o_configuration = swap(i_configuration) * PI;
}
```

The code you provide is for the vertex shader only, and even though a default fragment shader is created in order to successfully link the entire program, it plays no role whatsoever, as the resulting pixels are not used (`gl.RASTERIZER_DISCARD`)

## `renderStep`

The render step is a vertex shader that converts data from the struct into visible vertices.

It takes an input buffer that is read-only, and outputs vertex data into `gl_Position`, `gl_PointSize`, and `vertexColor`.

The fragment shader behind it is a simple default point rendering, which doesn't need any more data than those three values, and is thus built-in and non-modifiable.

## Methods

The return value from calling `new WGU.VertexFeedbackComputer` has the following methods :

- `update()`
- `render()`
- `run()`
- `destroy()`
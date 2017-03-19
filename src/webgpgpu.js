function WebGPGPU(context) {
	"use strict";

	if(!context) throw "Invalid GL context";
	const gl = context;

	class VertexFeedbackComputer {
		constructor(description) {

			this.units = description.units;
			this.struct = {
				fields: description.struct,
				layout: Object.entries(description.struct).map(([field, type], i) => Object.assign({field: field}, Util.glTypes[type])),
			}

			// Fill up byte-wise layout information
			let bytesSoFar  = 0;
			this.struct.layout.forEach(field => {
				field.offset = bytesSoFar;
				bytesSoFar += field.bytes;
			})
			this.struct.byteSize = bytesSoFar;

			this.updateUniforms = description.updateStep.params || {};
			this.updateShaderCode = description.updateStep.glsl;
			this.renderUniforms = description.renderStep.params || {};
			this.renderShaderCode = description.renderStep.glsl;

			// Call initialize for every unit sub-buffer
			this.initialData = new ArrayBuffer(this.units * this.struct.byteSize);
			if(description.initialize)
				for(let i = 0; i < this.units; i++)
					description.initialize(i, new Uint8Array(this.initialData, i * this.struct.byteSize, this.struct.byteSize));


			this.updateProgram = Util.buildProgram(
				// Takes in unit struct and output new values for the unit struct
				Util.buildShader(
					gl.VERTEX_SHADER,
					Util.prefixKeys("u_", this.updateUniforms),
					Util.prefixKeys("i_", this.struct.fields),
					Util.prefixKeys("o_", this.struct.fields),
					this.updateShaderCode
				),

				// Default constant fragment shader (has no effect on the feedback transform)
				Util.buildShader(
					gl.FRAGMENT_SHADER, {}, {}, {fragColor: "vec4"},
					`void main() {
						fragColor = vec4(1.0);
					}`
				)
			);

			this.renderProgram = Util.buildProgram(
				// Takes in unit struct and outputs vertexColor
				Util.buildShader(
					gl.VERTEX_SHADER,
					Util.prefixKeys("u_", this.renderUniforms),
					Util.prefixKeys("i_", this.struct.fields),
					{vertexColor: "vec4"},
					this.renderShaderCode
				),

				// Default pass-through fragment shader (we're simply drawing points)
				Util.buildShader(
					gl.FRAGMENT_SHADER, {}, {vertexColor: "vec4"}, {fragColor: "vec4"},
					`void main() {
						fragColor = vertexColor;
					}`
				)
			);

			// Force location layout on inputs, and setup transform feedback on the outputs
			Object.keys(this.struct.fields).map((name, i) => gl.bindAttribLocation(this.updateProgram, i, "i_" + name));
			Object.keys(this.struct.fields).map((name, i) => gl.bindAttribLocation(this.renderProgram, i, "i_" + name));
			gl.transformFeedbackVaryings(this.updateProgram, Object.keys(this.struct.fields).map(name => "o_" + name), gl.INTERLEAVED_ATTRIBS);

			// Relink everything
			gl.linkProgram(this.updateProgram);
			gl.linkProgram(this.renderProgram);
			[this.updateProgram, this.renderProgram].map(p => gl.getProgramInfoLog(p)).map(s => s ? console.warn(s) : 0);


			// Get uniform locations
			/*
			const updateUniformLocations = Object.from(Object.entries(updateUniforms).map(
				name => [name, gl.getUniformLocation(updateProgram, "u_"+name)]
			));
			const renderUniformLocations = Object.from(Object.entries(renderUniforms).map(
				name => [name, gl.getUniformLocation(renderProgram, "u_"+name)]
			));
			*/

			// Setup double buffering and transform feedback
			this.frontBuffer = Util.buildVertexBuffer(this.struct, this.initialData);
			this.backBuffer = Util.buildVertexBuffer(this.struct, this.initialData);
			this.transformFeedback = gl.createTransformFeedback();

			this.iteration = 0;
			this.run();
		}

		update(source, destination, steps) {
			// Setup context
			gl.useProgram(this.updateProgram);
			gl.enable(gl.RASTERIZER_DISCARD);

			// Bind source and destination buffers
			gl.bindVertexArray(source.vertexArray);
			gl.bindBuffer(gl.ARRAY_BUFFER, source.vertexBuffer);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
			gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, destination.vertexBuffer);

			// Set uniforms
			//gl.uniform1f(emitTimeLocation, time);
			//gl.uniform2f(emitAccelerationLocation, 0.0, ACCELERATION);

			// Update each unit
			for(let i = 0; i < (steps || 1); i++) {
				gl.beginTransformFeedback(gl.POINTS);
				gl.drawArrays(gl.POINTS, 0, this.units);
				gl.endTransformFeedback();
			}

			// Restore context
			gl.disable(gl.RASTERIZER_DISCARD);
			gl.useProgram(null);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
			gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
			gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
		}


		render(source) {
			// Setup context
			gl.useProgram(this.renderProgram);
			gl.bindVertexArray(source.vertexArray);
			gl.bindBuffer(gl.ARRAY_BUFFER, source.vertexBuffer);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

			// Set uniforms
			//gl.uniform1f(drawTimeLocation, time);
			//gl.uniform4f(drawColorLocation, 0.0, 1.0, 1.0, 1.0);
			//gl.uniform2f(drawAccelerationLocation, 0.0, ACCELERATION);

			// Render each unit
			gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.POINTS, 0, this.units);

			// Restore context
			gl.useProgram(null);
			gl.disable(gl.BLEND);
			gl.bindBuffer(gl.ARRAY_BUFFER, null);
		}

		run() {
			// Use each buffer alternatively
			if(this.iteration++ % 2) {
				this.update(this.frontBuffer, this.backBuffer);
				this.render(this.backBuffer);
			} else {
				this.update(this.backBuffer, this.frontBuffer);
				this.render(this.frontBuffer);
			}

			requestAnimationFrame(delta => this.run());
		}

		destroy() {
			gl.deleteTransformFeedback(this.transformFeedback);
			gl.deleteProgram(this.updateProgram);
			gl.deleteProgram(this.renderProgram);
			gl.deleteBuffer(this.frontBuffer.vertexBuffer);
			gl.deleteBuffer(this.backBuffer.vertexBuffer);
			gl.deleteVertexArray(this.frontBuffer.vertexArray);
			gl.deleteVertexArray(this.backBuffer.vertexArray);
		}
	}


	const Util = {
		glTypes: {
			"vec3": {literal: "vec3", constant: gl.FLOAT_VEC3, slotType: gl.FLOAT, slots: 3, bytes: 12},
			"vec2": {literal: "vec2", constant: gl.FLOAT_VEC2, slotType: gl.FLOAT, slots: 2, bytes: 8},
			"float": {literal: "float", constant: gl.FLOAT, slotType: gl.FLOAT, slots: 1, bytes: 4},
		},

		buildVertexBuffer(struct, bufferData) {
			// Create a new VAO (access wrapper) and a new VBO (actual memory region)
			const vertexArray = gl.createVertexArray();
			const vertexBuffer = gl.createBuffer();

			// Associate the VBO with the VAO and fill it with the initial data
			gl.bindVertexArray(vertexArray);
			gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, bufferData, gl.STREAM_COPY);

			// Set the VAO to the same bytewise layout as the struct
			struct.layout.map((field, i) => {
				gl.enableVertexAttribArray(i);
				gl.vertexAttribPointer(i, field.slots, field.slotType, false, struct.byteSize, field.offset);
			});

			return {vertexArray: vertexArray, vertexBuffer: vertexBuffer};
		},


		// Generate a list of customizable GLSL declaration from a Javascript map
		declarationList: (scope, map) => Object.entries(map || {}).map(([name, type]) => `${scope} ${type} ${name};`).join("\n"),

		// Prefix all keys of an object with a given string
		prefixKeys(prefix, map) {
			const prefixedMap = {};
			Object.keys(map).map(key => {
				prefixedMap[prefix + key] = map[key];
			});
			return prefixedMap;
		},

		buildShader(type, uniforms, inputs, outputs, code) {
			// Merge a GLSL header, declarations, and main code into a single source
			const source = `
				#version 300 es
				precision highp float;
				precision highp int;

				${Util.declarationList("uniform", uniforms)}
				${Util.declarationList("in", inputs)}
				${Util.declarationList("out", outputs)}

				${code}
			`.trim();

			// Build
			const shader = gl.createShader(type);
			gl.shaderSource(shader, source);
			gl.compileShader(shader);

			// Check for errors
			const log = gl.getShaderInfoLog(shader);
			if(log) console.warn(log);

			return shader;
		},

		buildProgram(vertexShader, fragmentShader) {
			// Merge one vertex shader and one fragment shader into a program
			const program = gl.createProgram();
			gl.attachShader(program, vertexShader);
			gl.attachShader(program, fragmentShader);
			//gl.linkProgram(program);

			// Check for errors
			const log = gl.getProgramInfoLog(program);
			if(log) console.warn(log);

			return program;
		}
	}

	return {VertexFeedbackComputer, Util};
}
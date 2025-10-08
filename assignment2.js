import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;
var yRotation = 0;
var zRotation = 0;
var zoom = 1.0;
var heightScale = 1.0;
var projectionType = 'perspective';
var xPan = 0.0;
var yPan = 0.0;

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sw
	};
}

function triangleMeshConverter(height, width, heightData)
{
    var positions = []; var colors = [];

    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width - 1; x++) {

            var heightTL = heightData[(y * width) + x];
            var heightTR = heightData[(y * width) + (x + 1)];
            var heightBL = heightData[((y + 1) * width) + x];
            var heightBR = heightData[((y + 1) * width) + (x + 1)];
            var xL = ((x / width) - 0.5) * 2.0;
			var zT = ((y / height) - 0.5) * 2.0;
            var xR = (((x + 1) / width) - 0.5) * 2.0;
            var zB = (((y + 1) / height) - 0.5) * 2.0;

            var triangle1 = [
                xL, heightTL, zT,
                xL, heightBL, zB,
                xR, heightTR, zT
            ];

            var triangle2 = [
                xR, heightTR, zT,
                xL, heightBL, zB,
                xR, heightBR, zB
            ];

            positions.push(...triangle1);
			positions.push(...triangle2);

            for (let i = 0; i < 6; i++) {
                var vertexHeight = [heightTL, heightBL, heightTR, heightTR, heightBL, heightBR][i];
                colors.push(vertexHeight, vertexHeight, vertexHeight); 
            }
        }
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        count: positions.length / 3
    }
}



window.loadImageFile = function(event)
{

	var f = event.target.files && event.target.files[0];
	if (!f) return;
	
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function() 
		{
			// heightmapData is globally defined
			heightmapData = processImage(img);
			var height = heightmapData.height;
			var width = heightmapData.width;
			var heightData = heightmapData.data;

			const mesh = triangleMeshConverter(height, width, heightData);
			vertexCount = mesh.count;

			const positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, mesh.positions);

			const positionAttribLoc = gl.getAttribLocation(program, "position");
			vao = createVAO(gl, positionAttribLoc, positionBuffer, null, null, null, null);

			console.log('loaded image: ' + heightmapData.width + ' x ' + heightmapData.height);

		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}


function draw()
{

	var fovRadians = 70 * Math.PI / 180;
	var aspectRatio = +gl.canvas.width / +gl.canvas.height;
	var nearClip = 0.001;
	var farClip = 20.0;


	var projectionMatrix;
	if (projectionType === 'perspective') {
		projectionMatrix = perspectiveMatrix(
			fovRadians,
			aspectRatio,
			nearClip,
			farClip,
		);
	} else {
		var halfHeight = 2.0 / zoom;
		var halfWidth = halfHeight * aspectRatio;
		var left = -halfWidth;
		var right = halfWidth;
		var bottom = -halfHeight;
		var top = halfHeight;

		projectionMatrix = orthographicMatrix(left, right, bottom, top, nearClip, farClip);
	}

	// eye and target
	var eye = [0, 5, 5];
	var target = [0, 0, 0];

	var modelMatrix = identityMatrix();

	// TODO: set up transformations to the model

	var modelMatrix = multiplyArrayOfMatrices([
		translateMatrix(xPan, yPan, 0.0),
		scaleMatrix(1.0, heightScale, 1.0),
		scaleMatrix(zoom, zoom, zoom),
		rotateYMatrix(yRotation),
		rotateZMatrix(zRotation)
	]);

	// setup viewing matrix
	var eyeToTarget = subtract(target, eye);
	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);


	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);
	
	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

	gl.bindVertexArray(vao);
	
	var primitiveType = gl.TRIANGLES;
	gl.drawArrays(primitiveType, 0, vertexCount);

	requestAnimationFrame(draw);

}

function createBox()
{
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i=1; i<=3; i++) 
	{
		var yAngle = i* (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) 
		{
			zoom *= 1.1;
			console.log("Scrolled up");
			// e.g., zoom in
		} else {
			zoom *= 0.9;
			console.log("Scrolled down");
			// e.g., zoom out
		}
	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;

		startX = currentX;
		startY = currentY;

		if (leftMouse) {
			yRotation += deltaX * 0.01;
			zRotation += deltaY * 0.01;
		} else {
			xPan += deltaX * 0.01;
			yPan -= deltaY * 0.01;
		}

		console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		// implement dragging logic
	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function initialize() 
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	document.getElementById("height").addEventListener("input", (e) => {
		var heightVal = parseFloat(e.target.value);
		heightScale = heightVal / 50.0;
	});

	document.getElementById("projectionType").addEventListener("change", (e) => {
		projectionType = e.target.value;
	});

	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	console.log(box);

	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

window.onload = initialize();
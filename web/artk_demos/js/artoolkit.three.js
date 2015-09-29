/* THREE.js ARToolKit integration */

/**
	Set this matrix's elements to the given column-major matrix array.

	@param {Float32Array} m - The array to copy
*/
THREE.Matrix4.prototype.setFromArray = function(m) {
	return this.elements.set(m);
};

/**
	Helper for setting up a Three.js AR scene using the device camera as input.
	Pass in the maximum dimensions of the video you want to process and onSuccess and onError callbacks.

	On a successful initialization, the onSuccess callback is called with an ThreeARScene object.
	The ThreeARScene object contains two THREE.js scenes (one for the video image and other for the 3D scene)
	and a couple of helper functions for doing video frame processing and AR rendering.

	Here's the structure of the ThreeARScene object:
	{
		scene: THREE.Scene, // The 3D scene. Put your AR objects here.
		camera: THREE.Camera, // The 3D scene camera.

		video: HTMLVideoElement, // The userMedia video element.

		videoScene: THREE.Scene, // The userMedia video image scene. Shows the video feed.
		videoCamera: THREE.Camera, // Camera for the userMedia video scene.

		process: function(), // Process the current video frame and update the markers in the scene.
		renderOn: function( THREE.WebGLRenderer ) // Render the AR scene and video background on the given Three.js renderer.
	}

	You should use the arScene.video.videoWidth and arScene.video.videoHeight to set the width and height of your renderer.

	In your frame loop, use arScene.process() and arScene.renderOn(renderer) to do frame processing and 3D rendering, respectively.

	@param {number} width - The maximum width of the userMedia video to request.
	@param {number} height - The maximum height of the userMedia video to request.
	@param {function} onSuccess - Called on successful initialization with an ThreeARScene object.
	@param {function} onError - Called if the initialization fails with the error encountered.
*/
artoolkit.getUserMediaThreeScene = function(width, height, onSuccess, onError) {
	artoolkit.init('../../builds', '../../bin/Data/camera_para.dat');
	if (!onError) {
		onError = function(err) {
			console.log("ERROR: artoolkit.getUserMediaThreeScene");
			console.log(err);
		};
	}
	var video = document.createElement('video');
	navigator.getUserMedia  = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
	var hdConstraints = {
		audio: false,
		video: {
			mandatory: {
				maxWidth: width,
				maxHeight: height
	    	}
	  	}
	};

	var completeInit = function() {
		artoolkit.setup(video.videoWidth, video.videoHeight);
		// artoolkit.debugSetup();

		var scenes = artoolkit.createThreeScene(video);
		onSuccess(scenes);
	};

	var initWaitCount = 2;
	var initProgress = function() {
		initWaitCount--;
		if (initWaitCount === 0) {
			completeInit();
		}
	};

	var success = function(stream) {
		video.addEventListener('loadedmetadata', initProgress, false);

		video.src = window.URL.createObjectURL(stream);
		video.play();

		artoolkit.onReady(initProgress);

	};

	if (navigator.getUserMedia) {
		navigator.getUserMedia(hdConstraints, success, onError);
	} else {
		onError('');
	}
};

artoolkit.createThreeScene = function(video) {
	// To display the video, first create a texture from it.
	var videoTex = new THREE.Texture(video);

	videoTex.minFilter = THREE.LinearFilter;
	videoTex.flipY = false;

	// Then create a plane textured with the video.
	var plane = new THREE.Mesh(
	  new THREE.PlaneBufferGeometry(2, 2),
	  new THREE.MeshBasicMaterial({map: videoTex, side: THREE.DoubleSide})
	);

	// The video plane shouldn't care about the z-buffer.
	plane.material.depthTest = false;
	plane.material.depthWrite = false;

	// Create a camera and a scene for the video plane and
	// add the camera and the video plane to the scene.
	var videoCamera = new THREE.OrthographicCamera(-1, 1, -1, 1, -1, 1);
	var videoScene = new THREE.Scene();
	videoScene.add(plane);
	videoScene.add(videoCamera);

	var scene = new THREE.Scene();
	var camera = new THREE.PerspectiveCamera(45, 1, 1, 1000)
	scene.add(camera);

	camera.matrixAutoUpdate = false;

	return {
		scene: scene,
		videoScene: videoScene,
		camera: camera,
		videoCamera: videoCamera,

		video: video,

		process: function() {
			for (var i in artoolkit.patternMarkers) {
				artoolkit.patternMarkers[i].visible = false;
			}
			for (var i in artoolkit.barcodeMarkers) {
				artoolkit.barcodeMarkers[i].visible = false;
			}
			artoolkit.process(video);
			camera.projectionMatrix.setFromArray(artoolkit.getCameraMatrix());
		},

		renderOn: function(renderer) {
			videoTex.needsUpdate = true;

			var ac = renderer.autoClear;
			renderer.autoClear = false;
			renderer.clear();
			renderer.render(this.videoScene, this.videoCamera);
			renderer.render(this.scene, this.camera);
			renderer.autoClear = ac;
		}
	};
};

/**
	Overrides the artoolkit.onGetMarker method to keep track of Three.js markers.

	@param {Object} marker - The marker object received from ARToolKitJS.cpp
*/
artoolkit.onGetMarker = function(marker) {
	var obj = this.patternMarkers[marker.idPatt];
	if (obj) {
		obj.matrix.setFromArray(artoolkit.getTransformationMatrix());
		obj.visible = true;
	}
	var obj = this.barcodeMarkers[marker.idMatrix];
	if (obj) {
		obj.matrix.setFromArray(artoolkit.getTransformationMatrix());
		obj.visible = true;
	}
};

/**
	Index of Three.js markers, maps markerID -> THREE.Object3D.
*/
artoolkit.patternMarkers = {};

/**
	Index of Three.js markers, maps markerID -> THREE.Object3D.
*/
artoolkit.barcodeMarkers = {};

/**
	Loads a marker from the given URL and calls the onSuccess callback with the UID of the marker.

	artoolkit.loadMarker(markerURL, onSuccess, onError);

	Synonym for artoolkit.addMarker.

	@param {string} markerURL - The URL of the marker pattern file to load.
	@param {function} onSuccess - The success callback. Called with the id of the loaded marker on a successful load.
	@param {function} onError - The error callback. Called with the encountered error if the load fails.
*/
artoolkit.loadMarker = artoolkit.addMarker;

/**
	Creates a Three.js marker Object3D for the given marker UID.
	The marker Object3D tracks the marker pattern when it's detected in the video.

	Use this after a successful artoolkit.loadMarker call:

	artoolkit.loadMarker('/bin/Data/patt.hiro', function(markerUID) {
		var markerRoot = artoolkit.createThreeMarker(markerUID);
		markerRoot.add(myFancyHiroModel);
		arScene.scene.add(markerRoot);
	});

	@param {number} markerUID - The UID of the marker to track.
	@return {THREE.Object3D} Three.Object3D that tracks the given marker.
*/
artoolkit.createThreeMarker = function(markerUID) {
	var obj = new THREE.Object3D();
	obj.matrixAutoUpdate = false;
	this.patternMarkers[markerUID] = obj;
	return obj;
};

/**
	Creates a Three.js marker Object3D for the given barcode marker UID. 
	The marker Object3D tracks the marker pattern when it's detected in the video.

	var markerRoot20 = artoolkit.createThreeBarcodeMarker(20);
	markerRoot20.add(myFancyNumber20Model);
	arScene.scene.add(markerRoot20);

	var markerRoot5 = artoolkit.createThreeBarcodeMarker(5);
	markerRoot5.add(myFancyNumber5Model);
	arScene.scene.add(markerRoot5);

	@param {number} markerUID - The UID of the barcode marker to track.
	@return {THREE.Object3D} Three.Object3D that tracks the given marker.
*/
artoolkit.createThreeBarcodeMarker = function(markerUID) {
	var obj = new THREE.Object3D();
	obj.matrixAutoUpdate = false;
	this.barcodeMarkers[markerUID] = obj;
	return obj;
};

console.log('loaded!!');
const HEIGHT = 480;
const WIDTH = 640;
const FPS = 30;
let videoCapture = null;
const video = document.getElementById('main-video');
const canvas = document.getElementById('main-canvas');
const outputCanvas = document.getElementById('output-canvas');
let context = canvas.getContext('2d');
let src = null;
let dst = null;
const startButton = document.getElementById('startButton');

function startCapture() {
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  .then(function(stream) {
    video.srcObject = stream;
    video.play();
  })
  .catch(function(err) {
    console.log("An error occurred! " + err);
  });
}

function playVideo() {
  let begin = Date.now();
  context.drawImage(video, 0, 0, WIDTH, HEIGHT);
  src.data.set(context.getImageData(0, 0, WIDTH, HEIGHT).data);
  cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
  cv.imshow("output-canvas", dst); // output-canvas is the id of another <canvas>;
  // schedule next one.
  let delay = 1000/FPS - (Date.now() - begin);
  setTimeout(playVideo, delay);
}


function onOpenCvReady() {
  cv['onRuntimeInitialized'] = () => {

  console.log('ready');
  video.width = canvas.width =  outputCanvas.width = WIDTH;
  video.height = canvas.height = outputCanvas.height = HEIGHT;
  videoCapture = new cv.VideoCapture(video);
  src = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC4);
  dst = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
  document.getElementById('status').innerHTML = 'Ready!';
  startCapture();
  setTimeout(playVideo, 0); // schedule first one.
  playVideo();
  // Remember to delete src and dst after when stop.

  };
}

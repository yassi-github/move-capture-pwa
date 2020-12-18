// accumilateWeightedが使えないので輪郭の検出のみ
// 輪郭検出のパーティクルは大体15000~20000あたり。明るさでも変化する。暗くなると0に近づく
// 動くと当然パーティクル数が変化する。普段動きのないとこを想定するなら4000ない程度かな？解像度による？
// 初期らへんの値を記録して，そこからの時間当たり変化量をみる？
// ゆっくり動くと検知されない？仕方ないか？

console.log('loaded!!');
const HEIGHT = 480;
const WIDTH = 640;
const FPS = 30;
let videoCapture = null;
const video = document.getElementById('main-video');
// const canvas = document.getElementById('main-canvas');
const outputCanvas = document.getElementById('output-canvas');
// let context = canvas.getContext('2d');
// can't use cv object/func for now.
let src = null;
let dst = null;
let before = null;
let originalCV_8UC1 = null;

let grayImg = null;
let delta = null;
let threshImg = null;
let threshImg_Copy = null;
let contours = null;
let hierarchy = null;
const startButton = document.getElementById('startButton');

function pass() {
  // nothing
}

// video要素にカメラをストリーム？
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

// 処理
function playVideo() {
  let begin = Date.now();
  // context.drawImage(video, 0, 0, WIDTH, HEIGHT);
  // src.data.set(video.srcObject.data);
  // src.data.set(context.getImageData(0, 0, WIDTH, HEIGHT).data);
  videoCapture.read(src); // videoCaptureからsrcにデータを読み込む

  // cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
  // 処理開始
  // convert to gray
  cv.cvtColor(src, grayImg, cv.COLOR_RGBA2GRAY);
  
  // get "before"frame for compare
  if (JSON.stringify(before.data) == JSON.stringify(originalCV_8UC1.data)) {
    grayImg.copyTo(before);
  } else { // already get frame
    // calculate
    processImg(); // modifying src
  }
  // src to dst
  // dst = src.clone(); // 内部でcopyToしてるので
  src.copyTo(dst); // こっちのがよさそう？

  cv.imshow("output-canvas", dst); // output-canvas is the id of another <canvas>;
  // schedule next one.
  let delay = 1000/FPS - (Date.now() - begin);
  setTimeout(playVideo, delay);
  // return delay;
}

// 加工処理
function processImg() {
  // cv.cvtColor(src, grayImg, cv.COLOR_RGBA2GRAY);
  // cv.accumulateWeighted(grayImg, before, 0.8); // not supported
  let tmp = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
  cv.convertScaleAbs(before, tmp);
  cv.absdiff(grayImg, tmp, delta);

  cv.threshold(delta, threshImg, 0, 255, cv.THRESH_OTSU);
  let count = cv.countNonZero(threshImg);

  document.getElementById('count').innerHTML = "Count: "+count;
  if (count > 8000) {
    document.getElementById('status').innerHTML = "detected";
  } else {
    document.getElementById('status').innerHTML = "noMotion";
  }

  threshImg.copyTo(threshImg_Copy);
  cv.findContours(threshImg_Copy, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let color = new cv.Scalar(255, 255, 0);
  cv.drawContours(src, contours, -1, color, 3);
}

// main関数
function onOpenCvReady() {
  cv['onRuntimeInitialized'] = () => {
    // we allowed to use cv object/func from now.
    console.log('ready');

    // video.width = canvas.width =  outputCanvas.width = WIDTH;
    // video.height = canvas.height = outputCanvas.height = HEIGHT;
    video.width = outputCanvas.width = WIDTH;
    video.height = outputCanvas.height = HEIGHT;

    videoCapture = new cv.VideoCapture(video);
    src = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC4);
    originalCV_8UC1 = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
    dst = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
    before = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);

    grayImg = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
    delta = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
    threshImg = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
    threshImg_Copy = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    
    originalCV_8UC1.copyTo(dst);
    originalCV_8UC1.copyTo(before);
    
    document.getElementById('status').innerHTML = 'Ready!';
    
    startCapture();
    setTimeout(playVideo, 0); // schedule first one.
    // while (1) { // wasmerror できない
    // playVideo();
    // setTimeout(pass, playVideo());
    // }
    // Remember to delete src and dst after when stop.
    
  };
}

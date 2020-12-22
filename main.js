// const WIDTH = document.getElementById('main-video').clientWidth;
// const HEIGHT = document.getElementById('main-video').clientHeight;
const WIDTH = 640;
const HEIGHT = 480;
const FPS = 30;
let videoCapture = null;
const video = document.getElementById('main-video');
const outputCanvas = document.getElementById('output-canvas');
// can't use cv object/func for now.
let src = null;
let dst = null;
let before = null;
let originalCV_8UC1 = null;

let grayImg = null;
let delta = null;
let threshImg = null;
let contours = null;
let hierarchy = null;

let countArray = new Array(10).fill(0);
let weightArray = new Array(countArray.length);
let weightSum = 0;

let detectArray = new Array(countArray.length);

let isPlaying = true;
let isSoMoving = false;
let isWebhookGranted = false;

const startButton = document.getElementById('startButton');
const startButtonAsEnvCamera = document.getElementById('startButtonAsEnvCamera');
const stopButton = document.getElementById('stopButton');
const slackButton = document.getElementById('slack-button');

slackButton.addEventListener('click', function() {
  if (document.getElementById('webhook-url').value === '') {
    return;
  } else if (isWebhookGranted === false) {
    document.getElementById('explanation').remove();
    let newmsg = document.createTextNode('Enabled!');
    document.getElementsByName('webhook-form')[0].appendChild(newmsg);
    isWebhookGranted = true;
    detectSoMoving();
  }
});

function sendSlackNotify() {
  outputCanvas.toBlob(function(blob) {
    let wrapDiv = document.createElement('div');
    let savedDate = document.createElement('div');
    savedDate.textContent = new Date().toTimeString().replaceAll(' ', '_');
    let newImg = document.createElement("img");
    let url = URL.createObjectURL(blob);
    slackFetch();
    
    newImg.onload = function() {
      URL.revokeObjectURL(url);
    };
    
    newImg.src = url;
    wrapDiv.appendChild(savedDate);
    wrapDiv.appendChild(newImg);
    document.querySelector('.save-area').prepend(wrapDiv);
  }, "image/png");
}
  
function slackFetch() {
  const data = {
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Detected*\n" + new Date().toTimeString().replaceAll(' ', '_') + "\n"
        },
        "accessory": {
          "type": "image",
          "image_url": "https://" +document.location.host +"/move-capture-pwa/icon/icon64.png",
          "alt_text": "Detected camera image"
        }
      }
    ]
  }

  const option  = {
    "method": "POST",
    "body": JSON.stringify(data)
  }

  const url = document.getElementById('webhook-url').value;
  
  fetch(url, option)
  .then(response => {
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then(data => console.log('Success!!:', data))
  .catch((error) => console.log('Error!!:', error));
  // SyntaxError: JSON.parse: unexpected character at line 1 column 1 of the JSON data
}

stopButton.addEventListener('click', () => {
  isPlaying = false;
});

startButton.addEventListener('click', () => {
  console.log("reload...");
  isPlaying = true;
  resetAll();
  startCapture(0);
  setTimeout(playVideo, 0);
});

startButtonAsEnvCamera.addEventListener('click', () => {
  console.log("reload...");
  isPlaying = true;
  resetAll();
  startCapture(1);
  setTimeout(playVideo, 0);
});

// video要素にカメラをストリーム？
function startCapture(opt) {
  if (video.srcObject != null) {
    // stop both video and audio
    stopButton.click();
  }

  let optionSetting = {
    video: true,
    audio: false,
    facingMode: null
  }

  if (opt === 1) {
    optionSetting = {
      video: true,
      audio: false,
      facingMode: {
        exact: "environment"
      }
    };
  } else {
    optionSetting = {
      video: true,
      audio: false,
      facingMode: "user"
    };
  }

  navigator.mediaDevices.getUserMedia(optionSetting)
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

  if (!isPlaying && video.srcObject) {
    // stop both video and audio
    video.srcObject.getTracks().forEach( (track) => {
      track.stop();
    });
    video.srcObject = null;
    if (JSON.stringify(dst.data) != JSON.stringify(originalCV_8UC1.data)) {
      dst.delete();
    }
    // delete()だけでは画面描画は消えないぽい
    outputCanvas.getContext('2d').clearRect(0,0,WIDTH,HEIGHT);
    return;
  }

  videoCapture.read(src); // videoCaptureからsrcにデータを読み込む

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
  // dst = src.clone(); // cloneは内部でcopyToしてるので
  src.copyTo(dst); // こっちのがよさそう

  cv.imshow("output-canvas", dst); // output-canvas is the id of another <canvas>;
  // schedule next one.
  let delay = 1000/FPS - (Date.now() - begin);
  setTimeout(playVideo, delay);
}

// 加工処理
function processImg() {
  // cv.accumulateWeighted(grayImg, before, 0.8); // not supported
  let tmp = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
  cv.convertScaleAbs(before, tmp);
  cv.absdiff(grayImg, tmp, delta);

  cv.threshold(delta, threshImg, 0, 255, cv.THRESH_OTSU);
  let count = cv.countNonZero(threshImg);

  document.getElementById('count').innerHTML = "Count: "+count;
  if (detectMove(count)) {
    document.getElementById('status').innerHTML = "detected";
    detectArray.push(1);
    detectArray.shift();
  } else {
    document.getElementById('status').innerHTML = "noMotion";
    detectArray.push(0);
    detectArray.shift();
  }
  
  countArray.push(count);
  countArray.shift();

  cv.findContours(threshImg, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let color = new cv.Scalar(0, 255, 0, 128);
  cv.drawContours(src, contours, -1, color, 3);
}

function detectSoMoving() {
  const isZero = (element) => element === 0;
  if (!detectArray.some(isZero) && JSON.stringify(dst.data) != JSON.stringify(originalCV_8UC1.data)) {
    document.getElementById('detect-status').innerHTML = "moved!!";
    isSoMoving = true;

    if (isWebhookGranted) {
      sendSlackNotify();
    }
    
    setTimeout(detectSoMoving, 30000);

  } else {
    document.getElementById('detect-status').innerHTML = "probably no motion..?";
    isSoMoving = false;
    setTimeout(detectSoMoving);
  }
}


function detectMove(count) { // => boolean
  // countarrayの加重平均を算出して
  // その値がcountの差分が閾値より大きいなら，検知(true)
  // それ以外は検知せず(false)
  const threshCount = 500;

  let weightedAve = null;
  let countSum = 0;
  // 重みづけ
  for (let i = 0; i < countArray.length; i++) {
    countSum += countArray[i] * weightArray[i];
  }
  // 加重平均
  weightedAve = countSum / weightSum;
  // 加重平均とcountとの絶対値差分
  absAveCount = weightedAve - count > 0 ?  weightedAve - count : count - weightedAve;
  // 閾値より大きいならtrue，小さいならfalse
  if (absAveCount > threshCount) {
    return true;
  }
  return false;
}

function resetAll() {
  video.width = outputCanvas.width = WIDTH;
  video.height = outputCanvas.height = HEIGHT;

  videoCapture = new cv.VideoCapture(video);
  src = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC4);
  dst = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
  before = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
  originalCV_8UC1 = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);

  grayImg = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
  delta = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC1);
  threshImg = new cv.Mat(HEIGHT, WIDTH, cv.CV_8UC4);
  contours = new cv.MatVector();
  hierarchy = new cv.Mat();
  
  countArray = new Array(10).fill(0);
  weightArray = new Array(countArray.length);
  weightSum = 0;

  detectArray = new Array(countArray.length);

  isPlaying = true;
  isSoMoving = false;

  originalCV_8UC1.copyTo(dst);
  originalCV_8UC1.copyTo(before);

  // 重みづけを決めて重み配列を作成する
  const PAD = 10000;
  for (let x = 0; x < weightArray.length; x++) {
    let weight;
    weight = (weightArray.length / PAD) * (x * x);
    weightArray[x] = Math.round(weight * PAD) / PAD;
    weightSum += weightArray[x];
  }
  weightSum = Math.round(weightSum * PAD) / PAD;
}

// main関数
function onOpenCvReady() {
  cv['onRuntimeInitialized'] = () => {
    // we allowed to use cv object/func from now.
    console.log('ready');

    resetAll();

    document.getElementById('status').innerHTML = 'Ready!';
    
    startCapture(0);
    setTimeout(playVideo, 0); // schedule first one.
  };
}

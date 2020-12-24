// service worker, chace, a2hs

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
  .then(function(register) {
    if (register.installing) {
      console.log("sw installing");
    } else if (register.waiting) {
      console.log("sw installed");
    } else if (register.active) {
      console.log("sw active");
    }
  }).catch(function(error) {
    console.log("Registration failed with " + error);
  });
}

// a2hs template code

let deferredPrompt;
const addBtn = document.querySelector('.a2hs-button');
addBtn.style.display = 'none';

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  // Update UI to notify the user they can add to home screen
  addBtn.style.display = 'block';

  addBtn.addEventListener('click', (e) => {
    // hide our user interface that shows our A2HS button
    addBtn.style.display = 'none';
    // Show the prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the A2HS prompt');
        } else {
          console.log('User dismissed the A2HS prompt');
        }
        deferredPrompt = null;
      });
  });
});

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
let isCaptureGranted = false;

let soMovingTimeoutID = null;

const startButton = document.getElementById('startButton');
const startButtonAsEnvCamera = document.getElementById('startButtonAsEnvCamera');
const stopButton = document.getElementById('stopButton');
const slackButton = document.getElementById('slack-button');
const webhookUrlInputElement = document.getElementById('webhook-url');
const captureButton = document.getElementById('capture-button');

captureButton.addEventListener('click', function() {
  document.getElementById('explanation').style.display = 'none';
  if (captureButton.textContent === 'Enable Capture!') {
    soMovingTimeoutID = setTimeout(detectSoMoving, 0);
    isCaptureGranted = true;
    captureButton.textContent = 'Capture Enabled!';
    captureButton.disabled = true;
    // captureButton.textContent = 'Disable Capture';
    return;
  }
  // スタート，再スタート時になぜか誤検出するためコメントアウト
  // if (captureButton.textContent === 'Disable Capture') {
  //   isCaptureGranted = false;
  //   captureButton.textContent = 'Enable Capture!';
  //   return;
  // }
});

webhookUrlInputElement.addEventListener('input', function() {
  if (webhookUrlInputElement.value === '') {
    slackButton.disabled = true;
  } else {
    slackButton.disabled = false;
  }
});

slackButton.addEventListener('click', function() {
  if (isWebhookGranted === false) {
    document.getElementById('explanation').remove();
    let newmsg = document.createTextNode('Enabled!');
    document.getElementsByName('webhook-form')[0].appendChild(newmsg);
    isWebhookGranted = true;
  }
});

function captureImg() {
  outputCanvas.toBlob(function(blob) {
    let wrapDiv = document.createElement('div');
    let savedDate = document.createElement('div');
    savedDate.textContent = new Date().toTimeString().replaceAll(' ', '_');
    let newImg = document.createElement("img");
    let url = URL.createObjectURL(blob);

    newImg.onload = function() {
      URL.revokeObjectURL(url);
    };

    newImg.src = url;
    wrapDiv.appendChild(savedDate);
    wrapDiv.appendChild(newImg);
    document.querySelector('.save-area').prepend(wrapDiv);
  }, "image/png");
}

function sendSlackNotify() {
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
  stopButton.disabled = true;
  startButton.disabled = false;
  startButtonAsEnvCamera.disabled = false;
  isPlaying = false;
});

startButton.addEventListener('click', () => {
  stopButton.disabled = false;
  startButton.disabled = true;
  startButtonAsEnvCamera.disabled = true;

  console.log("reload...");
  isPlaying = true;
  clearTimeout(soMovingTimeoutID);

  resetAll();
  startCapture(0);
  soMovingTimeoutID = setTimeout(detectSoMoving, 1 * 1000);
  setTimeout(playVideo, 0);
});

startButtonAsEnvCamera.addEventListener('click', () => {
  stopButton.disabled = false;
  startButton.disabled = true;
  startButtonAsEnvCamera.disabled = true;
  console.log("reload...");
  isPlaying = true;
  clearTimeout(soMovingTimeoutID);

  resetAll();
  startCapture(1);
  // すぐにdetectSoMovingを実行すると，再スタート時に誤検知されるので1秒待つ
  soMovingTimeoutID = setTimeout(detectSoMoving, 1 * 1000);
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
    facingMode: null,
    width: {
      ideal: window.screen.width/2
    },
    height: {
      ideal: window.screen.height/2
    },
    aspectRatio: window.screen.width/window.screen.height
  };

  if (opt === 1) {
    optionSetting.video.facingMode = "environment";
  } else {
    optionSetting.video.facingMode = "user";
  }

  navigator.mediaDevices.getUserMedia(optionSetting)
  .then(function(stream) {
    video.srcObject = stream;
    video.play();
  })
  .catch(function(err) {
    console.log("An error occurred! " + err);
    document.body.innerHTML = 'Camera is NOT available!';
    window.stop();
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
  if (!isCaptureGranted) {
    soMovingTimeoutID = setTimeout(detectSoMoving, 30000);
  }

  const isZero = (element) => !element;
  if (!detectArray.some(isZero) && JSON.stringify(dst.data) != JSON.stringify(originalCV_8UC1.data)) {
    document.getElementById('detect-status').innerHTML = "Captured!!";
    isSoMoving = true;

    captureImg();

    if (isWebhookGranted) {
      sendSlackNotify();
    }

    soMovingTimeoutID = setTimeout(detectSoMoving, 30 * 1000);

  } else {
    document.getElementById('detect-status').innerHTML = "Monitoring...";
    isSoMoving = false;
    soMovingTimeoutID = setTimeout(detectSoMoving);
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
  // WIDTH = outputCanvas.width = document.getElementById('main-video').clientWidth;
  // HEIGHT = outputCanvas.height = document.getElementById('main-video').clientHeight;

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

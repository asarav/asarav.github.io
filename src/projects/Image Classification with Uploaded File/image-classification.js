//A modified version of the image classification example provided by ml5 that can process any uploaded image.
// Initialize the Image Classifier method with MobileNet. A callback needs to be passed.
const classifier = ml5.imageClassifier('MobileNet', modelReady);

// A variable to hold the image we want to classify
let img;

function setup() {
  noCanvas();
  if (window.FileReader) {
    document.getElementById('files').addEventListener('change', handleFileSelect, false);
  } else {
    console.log('This browser does not support FileReader');
  }
}

function handleFileSelect(evt) {
  var files = evt.target.files;
  var f = files[0];
  var reader = new FileReader();
   
  reader.onload = (function(theFile) {
    return function(e) {
      console.log(theFile);
      console.log(e);
      if(img) {
        img.elt.parentNode.removeChild(img.elt);
      }
      img = createImg(e.target.result, imageReady);
      img.size(400, 400);
    };
  })(f);

  reader.readAsDataURL(f);
}

// Change the status when the model loads.
function modelReady(){
  select('#status').html('Model Loaded')
}

// When the image has been loaded,
// get a prediction for that image
function imageReady() {
  classifier.predict(img, gotResult);
  // You can also specify the amount of classes you want
  // classifier.predict(img, 10, gotResult);
}

// A function to run when we get any errors and the results
function gotResult(err, results) {
  // Display error in the console
  if (err) {
    console.error(err);
  }

  console.log(results);

  // The results are in an array ordered by probability.
  select('#result1').html(results[0].className);
  select('#probability1').html(nf(results[0].probability, 0, 2));

  if(results[1]) {
      select('#result2').html(results[1].className);
      select('#probability2').html(nf(results[1].probability, 0, 2));
  }

  if(results[2]) {
    select('#result3').html(results[2].className);
    select('#probability3').html(nf(results[2].probability, 0, 2));
}
}
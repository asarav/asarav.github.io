let charRNN;
let textInput;
let runningInference = false;

function setup() {
  setupButtons();

  charRNN = ml5.charRNN('hemingway/', modelReady);

  textInput = select('#textInput');
  select('#author').html('Hemingway');
  textInput.input(generate);
}

// A util function to create UI buttons
function setupButtons() {
  hemingway = select('#hemingway');
  hemingway.mousePressed(function() {
    select('#status').html('Loading Model');
    charRnn = ml5.charRNN('hemingway/', modelReady);
    select('#author').html('Hemingway');
  });

  darwin = select('#darwin');
  darwin.mousePressed(function() {
    select('#status').html('Loading Model');
    charRnn = ml5.charRNN('darwin/', modelReady);
    select('#author').html('Darwin');
  });

  jkRowling = select('#jkrowling');
  jkRowling.mousePressed(function() {
    select('#status').html('Loading Model');
    charRnn = ml5.charRNN('jkrowling_HP/', modelReady);
    select('#author').html('JK Rowling');
  });
}

function modelReady() {
  select('#status').html('Model Loaded');
  generate();
}

function generate() {
 if(!runningInference) {
   runningInference = true;

    select('#status').html('Generating...');

    let original = textInput.value();
    let txt = original.toLowerCase();

    if (txt.length > 0) {
      let data = {
        seed: txt,
        temperature: 0.8,
        length: 10
      };

      charRNN.generate(data, gotData);

      function gotData(err, result) {
        select('#status').html('Ready!');
        select('#original').html(original);
        select('#prediction').html(result.sample);
        runningInference = false;
      }
    } else {
      select('#original').html('');
      select('#prediction').html('');
      runningInference = false;
    }
  }
}
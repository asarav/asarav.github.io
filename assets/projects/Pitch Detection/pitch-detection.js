// Pitch variables
let crepe;
let audioStream;

// Circle variables
const scale = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']; 
const standardTuningFrequencies = {
  E4:  329.63,
  B3: 246.94,
  G3: 0,
  D3: 0,
  A2: 110.00,
  E2: 82.41
}

// Text variables
let currentNote = '';
let selectedNote = '';

function setup() {
  audioContext = getAudioContext();
  mic = new p5.AudioIn();
  mic.start(startPitch);
}

function startPitch() {
    //Browsers have trouble bringing in CREPE, so just use the model from the pitch example
  pitch = ml5.pitchDetection('./model/', audioContext, mic.stream, modelLoaded);
}

function modelLoaded() {
  setupButtons();
  getPitch();
}

// A util function to create UI buttons
function setupButtons() {
  E4 = select('#E4');
  E4.mousePressed(function() {
    selectedNote = standardTuningFrequencies['E4'];
    select('#selectedNote').html('E4');
  });

  B3 = select('#B3');
  B3.mousePressed(function() {
    selectedNote = standardTuningFrequencies['B3'];
    select('#selectedNote').html('B3');

  });

  G3 = select('#G3');
  G3.mousePressed(function() {
    selectedNote = standardTuningFrequencies['G3'];
    select('#selectedNote').html('G3');

  });

  D3 = select('#D3');
  D3.mousePressed(function() {
    selectedNote = standardTuningFrequencies['D3'];
    select('#selectedNote').html('D3');

  });

  A2 = select('#A2');
  A2.mousePressed(function() {
    selectedNote = standardTuningFrequencies['A2'];
    select('#selectedNote').html('A2');
  });

  E2 = select('#E2');
  E2.mousePressed(function() {
    selectedNote = standardTuningFrequencies['E2'];
    select('#selectedNote').html('E2');
  });
}

function getPitch() {
  pitch.getPitch(function(err, frequency) {
    if (frequency) {
      console.log(frequency);
      let midiNum = freqToMidi(frequency);
      currentNote = scale[midiNum % 12];
      console.log(midiNum);
      select('#currentNote').html(currentNote);
      if(frequency > selectedNote + 10) {
        select('#feedback').html('Too High');
        select('#currentFrequency').html('+ ' + (frequency - selectedNote));
      } else if(frequency < selectedNote - 10) {
        select('#feedback').html('Too Low');
        select('#currentFrequency').html(frequency - selectedNote);
      } else {
        select('#feedback').html('In Tune');
        select('#currentFrequency').html(frequency - selectedNote);
      }
    }
    getPitch();
  });
}
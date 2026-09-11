const sessionRef = db.collection("sessions").doc("klas1");
let vragen = [];
let huidigeIndex = 0;
let scoreA = 0;
let scoreB = 0;

async function startSessie() {
  const geselecteerdBestand = document.getElementById('vragenlijst').value;
  const response = await fetch('vragenlijsten/' + geselecteerdBestand);
  vragen = await response.json();
  
  huidigeIndex = 0;
  scoreA = 0;
  scoreB = 0;

  document.getElementById('quiz-box').style.display = 'block';
  
  // Update eerste vraag direct in Firestore
  stuurVraagNaarFirestore();
  luisterNaarAntwoorden();
}

function toonVraag() {
  const v = vragen[huidigeIndex];
  document.getElementById('emoji').innerText = v.emoji || '';
  document.getElementById('vraag-tekst').innerText = v.vraag;
  document.getElementById('optie-A').innerText = v.opties[0];
  document.getElementById('optie-B').innerText = v.opties[1];
  document.getElementById('optie-C').innerText = v.opties[2];
  document.getElementById('optie-D').innerText = v.opties[3];
  document.getElementById('status-tekst').innerText = "Wachten op antwoord van Team A of Team B...";
}

function stuurVraagNaarFirestore() {
  toonVraag();
  const v = vragen[huidigeIndex];
  
  sessionRef.set({
    actieveVraagIndex: huidigeIndex,
    vraagTekst: v.vraag,
    opties: {
      A: v.opties[0],
      B: v.opties[1],
      C: v.opties[2],
      D: v.opties[3]
    },
    correctAntwoord: v.correct,
    teamAGefaald: false,
    teamBGefaald: false,
    vraagAfgerond: false,
    winnaarTeam: null,
    scoreA: scoreA,
    scoreB: scoreB
  });
}

function volgendeVraag() {
  if (huidigeIndex < vragen.length - 1) {
    huidigeIndex++;
    stuurVraagNaarFirestore();
  }
}

function vorigeVraag() {
  if (huidigeIndex > 0) {
    huidigeIndex--;
    stuurVraagNaarFirestore();
  }
}

function luisterNaarAntwoorden() {
  sessionRef.onSnapshot((doc) => {
    const data = doc.data();
    if (!data) return;

    // Houd lokale scores gesynchroniseerd met Firestore data
    scoreA = data.scoreA || 0;
    scoreB = data.scoreB || 0;

    // Update scores op het scherm
    document.getElementById('score-A').innerText = scoreA;
    document.getElementById('score-B').innerText = scoreB;

    const statusEl = document.getElementById('status-tekst');

    if (data.vraagAfgerond) {
      if (data.winnaarTeam) {
        statusEl.innerText = `JUIST! Team ${data.winnaarTeam} heeft het goede antwoord gekozen! (+1 punt)`;
      } else {
        statusEl.innerText = "HELAAS! Beide teams hebben het verkeerde antwoord gekozen. Geen punten!";
      }
    } else {
      if (data.teamAGefaald && !data.teamBGefaald) {
        statusEl.innerText = "Team A koos een FOUT antwoord! Team A is uitgeschakeld voor deze vraag. Team B is nu aan zet!";
      } else if (data.teamBGefaald && !data.teamAGefaald) {
        statusEl.innerText = "Team B koos een FOUT antwoord! Team B is uitgeschakeld voor deze vraag. Team A is nu aan zet!";
      } else {
        statusEl.innerText = "Wachten op antwoord van Team A of Team B...";
      }
    }
  });
}

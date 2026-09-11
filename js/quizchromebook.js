const sessionRef = db.collection("sessions").doc("klas1");

// Deze functie wordt aangeroepen door antwoordA.html t/m antwoordD.html
function koppelChromebook(mijnLetter) {
  document.getElementById('knop-A').onclick = () => verwerkDruk(mijnLetter, 'A');
  document.getElementById('knop-B').onclick = () => verwerkDruk(mijnLetter, 'B');

  // Luister live naar wijzigingen op het digibord
  sessionRef.onSnapshot((doc) => {
    const data = doc.data();
    if (!data) return;

    // 1. Update de tekst van het antwoord voor deze Chromebook
    const antwoordTekst = data.opties ? data.opties[mijnLetter] : "...";
    document.getElementById('antwoord-tekst').innerText = antwoordTekst;

    // 2. Blokkeer de knoppen als de vraag al geantwoord is
    const knopA = document.getElementById('knop-A');
    const knopB = document.getElementById('knop-B');
    
    if (data.geantwoord) {
      knopA.disabled = true;
      knopB.disabled = true;
    } else {
      knopA.disabled = false;
      knopB.disabled = false;
    }
  });
}

async function verwerkDruk(letter, team) {
  // Transactie zorgt ervoor dat alleen de ALLEREERSTE druk geldt (race-conditie bescherming)
  try {
    await db.runTransaction(async (transaction) => {
      const sfDoc = await transaction.get(sessionRef);
      if (!sfDoc.exists) return;

      const data = sfDoc.data();
      
      // Als er al iemand heeft gedrukt, negeer deze druk
      if (data.geantwoord) return;

      const isCorrect = (letter === data.correctAntwoord);
      let nieuwScoreA = data.scoreA || 0;
      let nieuwScoreB = data.scoreB || 0;

      if (isCorrect) {
        if (team === 'A') nieuwScoreA++;
        if (team === 'B') nieuwScoreB++;
      }

      transaction.update(sessionRef, {
        geantwoord: true,
        gekozenAntwoord: letter,
        geantwoordDoorTeam: team,
        isCorrect: isCorrect,
        scoreA: nieuwScoreA,
        scoreB: nieuwScoreB
      });
    });
  } catch (e) {
    console.error("Transactie mislukt: ", e);
  }
}

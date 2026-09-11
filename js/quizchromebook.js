const sessionRef = db.collection("sessions").doc("klas1");

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

    const knopA = document.getElementById('knop-A');
    const knopB = document.getElementById('knop-B');

    // 2. Blokkeer de knoppen als de vraag is afgerond óf als het betreffende team is gefaald
    knopA.disabled = data.vraagAfgerond || data.teamAGefaald;
    knopB.disabled = data.vraagAfgerond || data.teamBGefaald;
  });
}

async function verwerkDruk(letter, team) {
  try {
    await db.runTransaction(async (transaction) => {
      const sfDoc = await transaction.get(sessionRef);
      if (!sfDoc.exists) return;

      const data = sfDoc.data();
      
      // Negeer als de vraag al is afgerond of als dit team al is gefaald
      if (data.vraagAfgerond) return;
      if (team === 'A' && data.teamAGefaald) return;
      if (team === 'B' && data.teamBGefaald) return;

      const isCorrect = (letter === data.correctAntwoord);

      if (isCorrect) {
        // GOED ANTWOORD: Vraag is direct klaar en team krijgt een punt
        let nieuwScoreA = data.scoreA || 0;
        let nieuwScoreB = data.scoreB || 0;

        if (team === 'A') nieuwScoreA++;
        if (team === 'B') nieuwScoreB++;

        transaction.update(sessionRef, {
          vraagAfgerond: true,
          winnaarTeam: team,
          scoreA: nieuwScoreA,
          scoreB: nieuwScoreB
        });

      } else {
        // FOUT ANTWOORD: Zet gefaald-status voor dit team
        const updateData = {};
        if (team === 'A') updateData.teamAGefaald = true;
        if (team === 'B') updateData.teamBGefaald = true;

        // Check of door deze fout nu BEIDE teams gefaald zijn
        const beideGefaald = (team === 'A' && data.teamBGefaald) || (team === 'B' && data.teamAGefaald);

        if (beideGefaald) {
          updateData.vraagAfgerond = true; // Niemand krijgt een punt
        }

        transaction.update(sessionRef, updateData);
      }
    });
  } catch (e) {
    console.error("Transactie mislukt: ", e);
  }
}

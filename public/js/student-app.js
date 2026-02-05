class StudentApp {
    constructor() {
        this.currentSession = null;
        this.studentInfo = null;
        this.currentQuestion = null;
        this.selectedAnswer = null;
        this.hasSubmitted = false;
        
        this.init();
    }
    
    async init() {
        try {
            // Wacht op Firebase login
            await anonymousLogin();
            
            // Check voor bestaande sessie in localStorage
            const savedSession = localStorage.getItem('studentSession');
            if (savedSession) {
                this.studentInfo = JSON.parse(savedSession);
                await this.joinExistingSession();
            } else {
                this.showJoinScreen();
            }
            
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Initialisatie fout:', error);
            this.showError('Fout bij verbinden. Vernieuw de pagina.');
        }
    }
    
    setupEventListeners() {
        // Join screen
        document.getElementById('join-btn').addEventListener('click', () => this.joinSession());
        document.getElementById('session-code-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinSession();
        });
        document.getElementById('student-name-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinSession();
        });
        
        // Waiting screen
        document.getElementById('leave-session-btn').addEventListener('click', () => this.leaveSession());
        
        // Question screen
        document.getElementById('submit-answer-btn').addEventListener('click', () => this.submitAnswer());
        document.getElementById('change-answer-btn').addEventListener('click', () => this.changeAnswer());
        document.getElementById('back-to-waiting-btn').addEventListener('click', () => this.showWaitingScreen());
        
        // Open answer input
        const openAnswerInput = document.getElementById('open-answer-input');
        if (openAnswerInput) {
            openAnswerInput.addEventListener('input', (e) => {
                this.selectedAnswer = e.target.value.trim();
            });
        }
    }
    
    showJoinScreen() {
        this.hideAllScreens();
        document.getElementById('join-screen').classList.remove('hidden');
        document.getElementById('session-code-input').focus();
    }
    
    showWaitingScreen() {
        this.hideAllScreens();
        document.getElementById('waiting-screen').classList.remove('hidden');
        
        if (this.studentInfo) {
            document.getElementById('display-student-name').textContent = this.studentInfo.name;
        }
        if (this.currentSession) {
            document.getElementById('display-session-code').textContent = this.currentSession.code;
        }
    }
    
    showQuestionScreen() {
        this.hideAllScreens();
        document.getElementById('question-screen').classList.remove('hidden');
        
        if (this.studentInfo) {
            document.getElementById('current-student-name').textContent = this.studentInfo.name;
        }
    }
    
    showLoadingScreen() {
        this.hideAllScreens();
        document.getElementById('loading-screen').classList.remove('hidden');
    }
    
    hideAllScreens() {
        document.getElementById('join-screen').classList.add('hidden');
        document.getElementById('waiting-screen').classList.add('hidden');
        document.getElementById('question-screen').classList.add('hidden');
        document.getElementById('loading-screen').classList.add('hidden');
    }
    
    async joinExistingSession() {
        try {
            this.showLoadingScreen();
            
            // Zoek de sessie op ID
            const sessionDoc = await sessionsCollection.doc(this.studentInfo.sessionId).get();
            
            if (!sessionDoc.exists || !sessionDoc.data().active) {
                throw new Error('Sessie niet gevonden of beëindigd');
            }
            
            this.currentSession = {
                id: sessionDoc.id,
                ...sessionDoc.data()
            };
            
            // Luister naar sessie updates
            this.setupSessionListener();
            
            this.showWaitingScreen();
            
        } catch (error) {
            console.error('Fout bij herverbinden:', error);
            localStorage.removeItem('studentSession');
            this.showJoinScreen();
            this.showError('Sessie niet meer beschikbaar. Voer de code opnieuw in.');
        }
    }
    
    async joinSession() {
        try {
            const code = document.getElementById('session-code-input').value.trim();
            const name = document.getElementById('student-name-input').value.trim();
            
            // Validatie
            if (!code || code.length !== 4) {
                this.showError('Voer een geldige 4-cijferige code in');
                return;
            }
            
            if (!name) {
                this.showError('Voer je naam in');
                return;
            }
            
            this.showLoadingScreen();
            
            // Zoek sessie op code
            const sessionsSnapshot = await sessionsCollection
                .where('code', '==', code)
                .where('active', '==', true)
                .limit(1)
                .get();
            
            if (sessionsSnapshot.empty) {
                throw new Error('Geen actieve sessie gevonden met deze code');
            }
            
            const sessionDoc = sessionsSnapshot.docs[0];
            const sessionData = sessionDoc.data();
            
            // Voeg leerling toe aan sessie
            const studentRef = await studentsCollection.add({
                sessionId: sessionDoc.id,
                name: name,
                joinedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            this.currentSession = {
                id: sessionDoc.id,
                ...sessionData
            };
            
            this.studentInfo = {
                id: studentRef.id,
                sessionId: sessionDoc.id,
                name: name
            };
            
            // Sla op in localStorage
            localStorage.setItem('studentSession', JSON.stringify(this.studentInfo));
            
            // Luister naar sessie updates
            this.setupSessionListener();
            
            this.showWaitingScreen();
            
        } catch (error) {
            console.error('Fout bij deelnemen:', error);
            this.showJoinScreen();
            this.showError(error.message);
        }
    }
    
    setupSessionListener() {
        if (!this.currentSession) return;
        
        // Luister naar sessie updates
        sessionsCollection.doc(this.currentSession.id).onSnapshot((doc) => {
            if (!doc.exists) {
                this.showError('Sessie is beëindigd');
                localStorage.removeItem('studentSession');
                this.showJoinScreen();
                return;
            }
            
            const sessionData = doc.data();
            
            if (!sessionData.active) {
                this.showError('Sessie is beëindigd door de leraar');
                localStorage.removeItem('studentSession');
                this.showJoinScreen();
                return;
            }
            
            // Update huidige vraag
            const currentQuestionIndex = sessionData.currentQuestion || 0;
            const questions = sessionData.questions || [];
            
            if (questions.length > 0 && currentQuestionIndex < questions.length) {
                const question = questions[currentQuestionIndex];
                
                // Controleer of de vraag veranderd is
                if (!this.currentQuestion || this.currentQuestion.nr !== question.nr) {
                    this.currentQuestion = question;
                    this.hasSubmitted = false;
                    this.selectedAnswer = null;
                    this.displayQuestion(question);
                    this.showQuestionScreen();
                }
            } else {
                // Geen actieve vraag, toon wacht scherm
                this.showWaitingScreen();
            }
        });
    }
    
    displayQuestion(question) {
        // Update vraag tekst
        document.getElementById('question-text').textContent = question.vraag;
        document.getElementById('question-number').textContent = question.nr;
        
        // Reset alle vraag types
        document.getElementById('multiple-choice-options').classList.add('hidden');
        document.getElementById('open-answer-container').classList.add('hidden');
        document.getElementById('yesno-options').classList.add('hidden');
        document.getElementById('answer-status').classList.add('hidden');
        document.getElementById('submit-answer-btn').classList.remove('hidden');
        document.getElementById('change-answer-btn').classList.add('hidden');
        
        // Reset geselecteerde antwoorden
        document.querySelectorAll('.option.selected').forEach(el => {
            el.classList.remove('selected');
        });
        document.querySelectorAll('.yesno-option.selected').forEach(el => {
            el.classList.remove('selected');
        });
        document.getElementById('open-answer-input').value = '';
        
        // Toon juiste vraag type
        switch(question.type) {
            case 'meerkeuze':
                this.displayMultipleChoice(question);
                break;
            case 'open':
                this.displayOpenAnswer();
                break;
            case 'ja/nee':
                this.displayYesNo();
                break;
        }
        
        // Controleer of er al een antwoord is
        this.checkExistingAnswer();
    }
    
    displayMultipleChoice(question) {
        const container = document.getElementById('multiple-choice-options');
        container.innerHTML = '';
        container.classList.remove('hidden');
        
        question.opties.forEach((optie, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.innerHTML = `
                <div class="option-letter">${String.fromCharCode(65 + index)}</div>
                <div class="option-text">${optie}</div>
            `;
            
            optionDiv.addEventListener('click', () => {
                if (this.hasSubmitted) return;
                
                // Deselecteer andere opties
                document.querySelectorAll('#multiple-choice-options .option').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // Selecteer deze optie
                optionDiv.classList.add('selected');
                this.selectedAnswer = index;
            });
            
            container.appendChild(optionDiv);
        });
    }
    
    displayOpenAnswer() {
        const container = document.getElementById('open-answer-container');
        const input = document.getElementById('open-answer-input');
        
        container.classList.remove('hidden');
        input.value = '';
        input.focus();
        
        input.addEventListener('input', (e) => {
            if (!this.hasSubmitted) {
                this.selectedAnswer = e.target.value.trim();
            }
        });
    }
    
    displayYesNo() {
        const container = document.getElementById('yesno-options');
        container.classList.remove('hidden');
        
        document.querySelectorAll('.yesno-option').forEach(option => {
            option.classList.remove('selected');
            
            option.addEventListener('click', () => {
                if (this.hasSubmitted) return;
                
                // Deselecteer andere opties
                document.querySelectorAll('.yesno-option').forEach(el => {
                    el.classList.remove('selected');
                });
                
                // Selecteer deze optie
                option.classList.add('selected');
                this.selectedAnswer = option.dataset.answer;
            });
        });
    }
    
    async checkExistingAnswer() {
        if (!this.studentInfo || !this.currentQuestion) return;
        
        try {
            const answersSnapshot = await answersCollection
                .where('sessionId', '==', this.currentSession.id)
                .where('studentId', '==', this.studentInfo.id)
                .where('questionNr', '==', this.currentQuestion.nr - 1) // 0-based index
                .limit(1)
                .get();
            
            if (!answersSnapshot.empty) {
                const answerDoc = answersSnapshot.docs[0];
                const answerData = answerDoc.data();
                
                this.selectedAnswer = answerData.answer;
                this.hasSubmitted = true;
                
                this.showAnswerSubmitted();
            }
            
        } catch (error) {
            console.error('Fout bij controleren antwoord:', error);
        }
    }
    
    async submitAnswer() {
        if (!this.studentInfo || !this.currentQuestion || !this.currentSession) {
            this.showError('Niet verbonden met sessie');
            return;
        }
        
        if (this.selectedAnswer === null || this.selectedAnswer === '') {
            this.showError('Selecteer of typ een antwoord');
            return;
        }
        
        try {
            // Controleer of er al een antwoord is
            const existingAnswers = await answersCollection
                .where('sessionId', '==', this.currentSession.id)
                .where('studentId', '==', this.studentInfo.id)
                .where('questionNr', '==', this.currentQuestion.nr - 1)
                .limit(1)
                .get();
            
            if (!existingAnswers.empty) {
                // Update bestaand antwoord
                const answerDoc = existingAnswers.docs[0];
                await answerDoc.ref.update({
                    answer: this.selectedAnswer,
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Maak nieuw antwoord
                await answersCollection.add({
                    sessionId: this.currentSession.id,
                    studentId: this.studentInfo.id,
                    questionNr: this.currentQuestion.nr - 1, // 0-based index
                    answer: this.selectedAnswer,
                    submittedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            this.hasSubmitted = true;
            this.showAnswerSubmitted();
            
        } catch (error) {
            console.error('Fout bij verzenden antwoord:', error);
            this.showError('Fout bij opslaan antwoord: ' + error.message);
        }
    }
    
    showAnswerSubmitted() {
        document.getElementById('answer-status').classList.remove('hidden');
        document.getElementById('submit-answer-btn').classList.add('hidden');
        document.getElementById('change-answer-btn').classList.remove('hidden');
        
        // Maak inputs read-only
        document.querySelectorAll('#multiple-choice-options .option').forEach(el => {
            el.style.pointerEvents = 'none';
        });
        
        document.querySelectorAll('.yesno-option').forEach(el => {
            el.style.pointerEvents = 'none';
        });
        
        const openAnswerInput = document.getElementById('open-answer-input');
        if (openAnswerInput) {
            openAnswerInput.readOnly = true;
        }
    }
    
    changeAnswer() {
        this.hasSubmitted = false;
        document.getElementById('answer-status').classList.add('hidden');
        document.getElementById('submit-answer-btn').classList.remove('hidden');
        document.getElementById('change-answer-btn').classList.add('hidden');
        
        // Maak inputs weer editable
        document.querySelectorAll('#multiple-choice-options .option').forEach(el => {
            el.style.pointerEvents = 'auto';
        });
        
        document.querySelectorAll('.yesno-option').forEach(el => {
            el.style.pointerEvents = 'auto';
        });
        
        const openAnswerInput = document.getElementById('open-answer-input');
        if (openAnswerInput) {
            openAnswerInput.readOnly = false;
            openAnswerInput.focus();
        }
    }
    
    async leaveSession() {
        if (confirm('Weet je zeker dat je de sessie wilt verlaten?')) {
            localStorage.removeItem('studentSession');
            this.showJoinScreen();
        }
    }
    
    showError(message) {
        const errorDiv = document.getElementById('error-message');
        const errorText = document.getElementById('error-text');
        
        if (errorDiv && errorText) {
            errorText.textContent = message;
            errorDiv.classList.remove('hidden');
            
            // Verberg na 5 seconden
            setTimeout(() => {
                errorDiv.classList.add('hidden');
            }, 5000);
        } else {
            alert(message);
        }
    }
}

// Initialiseer de app wanneer de pagina laadt
document.addEventListener('DOMContentLoaded', () => {
    new StudentApp();
});

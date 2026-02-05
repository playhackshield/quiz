class TeacherApp {
    constructor() {
        this.currentSession = null;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.students = new Map();
        this.answers = new Map();
        this.questionnaires = [];
        this.selectedQuestionnaire = null;
        this.init();
    }
    
    async init() {
        try {
            // Wacht op Firebase login
            await anonymousLogin();
            
            // Check voor bestaande sessie in localStorage
            const savedSession = localStorage.getItem('teacherSession');
            if (savedSession) {
                this.currentSession = JSON.parse(savedSession);
                await this.loadSession(this.currentSession.id);
                this.showActiveSession();
            } else {
                this.showSessionCreation();
            }
            
            this.setupEventListeners();

            await this.loadQuestionnaires();
            
        } catch (error) {
            console.error('Initialisatie fout:', error);
            alert('Fout bij verbinden met database. Vernieuw de pagina.');
        }
    }
    
    setupEventListeners() {
        // Session creation
        document.getElementById('create-session-btn').addEventListener('click', () => this.createSession());
        
        // Navigation
        document.getElementById('prev-question-btn').addEventListener('click', () => this.previousQuestion());
        document.getElementById('next-question-btn').addEventListener('click', () => this.nextQuestion());
        
        // Actions
        document.getElementById('copy-link-btn').addEventListener('click', () => this.copySessionLink());
        document.getElementById('view-answers-btn').addEventListener('click', () => this.viewAnswers());
        document.getElementById('end-session-btn').addEventListener('click', () => this.endSession());
        document.getElementById('export-btn').addEventListener('click', () => this.exportAnswers());
        
        // Form submit on Enter
        document.getElementById('questions-json').addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.createSession();
            }
        });

        document.getElementById('questionnaire-select').addEventListener('change', (e) => {
            this.handleQuestionnaireSelect(e.target.value);
        });
    
        document.getElementById('refresh-questionnaires').addEventListener('click', () => {
            this.loadQuestionnaires();
        });
        
        // Verander JSON wanneer gebruiker typt (update count)
        document.getElementById('questions-json').addEventListener('input', (e) => {
            this.updateQuestionCount();
            this.markAsCustom();
        });
    }
    
    showSessionCreation() {
        document.getElementById('session-creation').classList.remove('hidden');
        document.getElementById('active-session').classList.add('hidden');
        document.getElementById('loading-screen').classList.add('hidden');
    }
    
    showActiveSession() {
        document.getElementById('session-creation').classList.add('hidden');
        document.getElementById('active-session').classList.remove('hidden');
        document.getElementById('loading-screen').classList.add('hidden');
    }
    
    showLoading() {
        document.getElementById('loading-screen').classList.remove('hidden');
    }
    
async createSession() {
    try {
        this.showLoading();
        
        const title = document.getElementById('quiz-title').value.trim() || 'Quiz Sessie';
        const questionsJson = document.getElementById('questions-json').value;
        
        let questions;
        try {
            const parsed = JSON.parse(questionsJson);
            questions = validateQuestions(parsed);
        } catch (e) {
            console.warn('Ongeldige JSON, gebruik standaard vragen');
            questions = validateQuestions([
                {
                    type: "meerkeuze",
                    vraag: "Wat is de hoofdstad van Nederland?",
                    opties: ["Amsterdam", "Rotterdam", "Den Haag", "Utrecht"]
                }
            ]);
        }
        
        const code = generateSessionCode();
        const teacherId = auth.currentUser.uid;
        
        // 👇 OPSLAAN WELKE QUESTIONNAIRE GEBRUIKT IS
        const sessionData = {
            title: title,
            code: code,
            teacherId: teacherId,
            currentQuestion: 0,
            questions: questions,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            active: true,
            studentCount: 0
        };
        
        // Voeg questionnaire info toe als er een geselecteerd was
        if (this.selectedQuestionnaire) {
            sessionData.questionnaire = this.selectedQuestionnaire;
            sessionData.questionnaireName = this.getQuestionnaireDisplayName(this.selectedQuestionnaire);
        }
        
        // Maak sessie in Firestore
        const sessionRef = await sessionsCollection.add(sessionData);
        
        this.currentSession = {
            id: sessionRef.id,
            code: code,
            title: title,
            teacherId: teacherId,
            questionnaire: this.selectedQuestionnaire
        };
        
        // Sla op in localStorage
        localStorage.setItem('teacherSession', JSON.stringify(this.currentSession));
        
        // Laad de sessie
        await this.loadSession(sessionRef.id);
        this.showActiveSession();
        
        // Toon succes bericht met questionnaire info
        let message = `Sessie aangemaakt! Code: ${code}`;
        if (this.selectedQuestionnaire) {
            message += `\nVragenlijst: ${this.getQuestionnaireDisplayName(this.selectedQuestionnaire)}`;
        }
        
        this.showMessage(message, 'success');
        
    } catch (error) {
        console.error('Fout bij aanmaken sessie:', error);
        this.showMessage('Fout: ' + error.message, 'error');
        this.showSessionCreation();
    }
}
    
async loadSession(sessionId) {
    try {
        console.log("Session laden:", sessionId);
        
        // Luister naar sessie updates
        sessionsCollection.doc(sessionId).onSnapshot((doc) => {
            if (!doc.exists) {
                this.showMessage('Sessie niet gevonden', 'error');
                localStorage.removeItem('teacherSession');
                this.showSessionCreation();
                return;
            }
            
            const data = doc.data();
            this.currentQuestionIndex = data.currentQuestion || 0;
            this.questions = data.questions || [];
            
            // Update UI
            this.updateSessionDisplay(data);
            this.displayCurrentQuestion();
        }, (error) => {
            console.error("Fout bij luisteren naar sessie:", error);
        });
        
        // 👇 VERBETERDE VERSIE: Luister naar leerlingen
        studentsCollection
            .where('sessionId', '==', sessionId)
            .orderBy('joinedAt', 'asc')
            .onSnapshot((snapshot) => {
                console.log("Leerlingen snapshot ontvangen:", snapshot.size, "leerlingen");
                
                this.students.clear();
                snapshot.forEach(doc => {
                    const studentData = doc.data();
                    const student = {
                        id: doc.id,
                        name: studentData.name,
                        joinedAt: studentData.joinedAt,
                        sessionId: studentData.sessionId
                    };
                    this.students.set(doc.id, student);
                    console.log("Leerling toegevoegd:", student.name, "(ID:", doc.id + ")");
                });
                
                this.updateStudentList();
                this.updateSessionDisplay({}); // Update student count
            }, (error) => {
                console.error("Fout bij luisteren naar leerlingen:", error);
            });
        
        // Luister naar antwoorden
        answersCollection
            .where('sessionId', '==', sessionId)
            .onSnapshot((snapshot) => {
                console.log("Antwoorden snapshot ontvangen:", snapshot.size, "antwoorden");
                
                this.answers.clear();
                snapshot.forEach(doc => {
                    const answer = doc.data();
                    const key = `${answer.studentId}_${answer.questionNr}`;
                    this.answers.set(key, answer);
                });
                
                this.updateStudentList();
                this.updateAnswerStats(); 
            }, (error) => {
                console.error("Fout bij luisteren naar antwoorden:", error);
            });
            
    } catch (error) {
        console.error('Fout bij laden sessie:', error);
        this.showMessage('Fout bij laden: ' + error.message, 'error');
    }
}   
    
updateSessionDisplay(sessionData) {
    console.log("Update session display:", {
        code: sessionData.code,
        studentCount: this.students.size
    });
    
    // DEBUG: Check of elementen bestaan
    const elements = {
        sessionCode: document.getElementById('session-code'),
        displayCode: document.getElementById('display-code'),
        studentCount: document.getElementById('student-count'),
        totalStudents: document.getElementById('total-students'),
        totalQuestions: document.getElementById('total-questions')
    };
    
    console.log("Elementen gevonden:", elements);
    
    // Alleen updaten als element bestaat
    if (elements.sessionCode) {
        elements.sessionCode.textContent = sessionData.code || this.currentSession?.code || '----';
    }
    
    if (elements.displayCode) {
        elements.displayCode.textContent = sessionData.code || this.currentSession?.code || '----';
    }
    
    if (elements.studentCount) {
        elements.studentCount.textContent = this.students.size;
    }
    
    if (elements.totalStudents) {
        elements.totalStudents.textContent = this.students.size;
    }
    
    if (elements.totalQuestions) {
        elements.totalQuestions.textContent = this.questions.length;
    }
}
    
    displayCurrentQuestion() {
        if (!this.questions || this.questions.length === 0) {
            document.getElementById('question-text').textContent = 'Geen vragen beschikbaar';
            return;
        }
        
        const question = this.questions[this.currentQuestionIndex];
        if (!question) return;
        
        // Update vraag display
        document.getElementById('question-text').textContent = question.vraag;
        document.getElementById('current-question-nr').textContent = this.currentQuestionIndex + 1;
        
        const questionDisplay = document.getElementById('question-display');
        questionDisplay.innerHTML = '';
        
        // Toon vraag op basis van type
        switch(question.type) {
            case 'meerkeuze':
                this.displayMultipleChoice(question, questionDisplay);
                break;
            case 'open':
                this.displayOpenQuestion(questionDisplay);
                break;
            case 'ja/nee':
                this.displayYesNoQuestion(questionDisplay);
                break;
        }
        
        // Update antwoord statistieken
        this.updateAnswerStats();
        
        // Update navigatie knoppen
        document.getElementById('prev-question-btn').disabled = this.currentQuestionIndex === 0;
        document.getElementById('next-question-btn').disabled = this.currentQuestionIndex === this.questions.length - 1;
    }
    
    displayMultipleChoice(question, container) {
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'options-container';
        
        question.opties.forEach((optie, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.innerHTML = `
                <div class="option-letter">${String.fromCharCode(65 + index)}</div>
                <div class="option-text">${optie}</div>
            `;
            optionsContainer.appendChild(optionDiv);
        });
        
        container.appendChild(optionsContainer);
    }
    
    displayOpenQuestion(container) {
        container.innerHTML = `
            <div class="info-box">
                <h3><i class="fas fa-edit"></i> Open vraag</h3>
                <p>Leerlingen kunnen een tekstueel antwoord geven.</p>
            </div>
        `;
    }
    
    displayYesNoQuestion(container) {
        container.innerHTML = `
            <div class="yesno-container">
                <div class="yesno-option">
                    <div class="yesno-icon">
                        <i class="fas fa-thumbs-up"></i>
                    </div>
                    <div class="yesno-text">Ja</div>
                </div>
                <div class="yesno-option">
                    <div class="yesno-icon">
                        <i class="fas fa-thumbs-down"></i>
                    </div>
                    <div class="yesno-text">Nee</div>
                </div>
            </div>
        `;
    }
    
updateStudentList() {
    const studentList = document.getElementById('student-list');
    
    console.log("Update student list voor vraag:", this.currentQuestionIndex + 1);
    
    if (this.students.size === 0) {
        studentList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-clock"></i>
                <p>Nog geen leerlingen aangemeld</p>
                <small>Leerlingen kunnen deelnemen via de code: <strong>${this.currentSession?.code || '----'}</strong></small>
            </div>
        `;
        return;
    }
    
    studentList.innerHTML = Array.from(this.students.values()).map(student => {
        // 👇 VERBETERDE CHECK: Alleen kijken naar antwoorden voor HUIDIGE vraag
        const hasAnswered = Array.from(this.answers.keys()).some(key => {
            const [studentId, questionNr] = key.split('_');
            return studentId === student.id && 
                   parseInt(questionNr) === this.currentQuestionIndex; // 👈 Alleen huidige vraag!
        });
        
        console.log(`Leerling ${student.name}: heeft geantwoord op vraag ${this.currentQuestionIndex + 1} = ${hasAnswered}`);
        
        return `
            <div class="student-item ${hasAnswered ? 'answered' : ''}">
                <div class="student-name">
                    <i class="fas fa-user"></i>
                    ${student.name}
                </div>
                <div class="student-status ${hasAnswered ? 'answered' : ''}">
                    ${hasAnswered ? 
                        '<i class="fas fa-check-circle"></i> Beantwoord' : 
                        '<i class="far fa-clock"></i> Wachtend'}
                </div>
            </div>
        `;
    }).join('');
    
    this.updateAnswerStats();
}
    
updateAnswerStats() {
    try {
        // Bereken aantal antwoorden voor huidige vraag
        let answeredCount = 0;
        
        this.answers.forEach((answer, key) => {
            const questionNr = parseInt(key.split('_')[1]);
            if (questionNr === this.currentQuestionIndex) {
                answeredCount++;
            }
        });
        
        console.log(`📊 Antwoord stats: ${answeredCount}/${this.students.size} (vraag ${this.currentQuestionIndex + 1})`);
        
        // Update DOM - veilig met null checks
        const answeredEl = document.getElementById('answered-count');
        const totalEl = document.getElementById('total-students');
        
        if (answeredEl) {
            answeredEl.textContent = answeredCount;
            // Visuele feedback
            answeredEl.style.color = answeredCount > 0 ? '#16a34a' : '#dc2626';
            answeredEl.style.fontWeight = 'bold';
        } else {
            console.warn("❌ Element 'answered-count' niet gevonden");
        }
        
        if (totalEl) {
            totalEl.textContent = this.students.size;
        } else {
            console.warn("❌ Element 'total-students' niet gevonden");
        }
        
        // Update progress bar (optioneel)
        this.updateProgressBar(answeredCount, this.students.size);
        
    } catch (error) {
        console.error("Fout in updateAnswerStats:", error);
    }
}

// Optioneel: progress bar voor visuele feedback
updateProgressBar(answered, total) {
    if (total === 0) return;
    
    const percentage = Math.round((answered / total) * 100);
    console.log(`📈 Progress: ${percentage}% (${answered}/${total})`);
    
    // Je kunt hier een progress bar updaten als je die toevoegt
    const progressBar = document.getElementById('answer-progress-bar');
    if (progressBar) {
        progressBar.style.width = `${percentage}%`;
        progressBar.textContent = `${answered}/${total}`;
    }
}
    
        async previousQuestion() {
        if (this.currentQuestionIndex > 0) {
            this.currentQuestionIndex--;
            await this.updateCurrentQuestion();
        }
    }
    
    async nextQuestion() {
        if (this.currentQuestionIndex < this.questions.length - 1) {
            this.currentQuestionIndex++;
            await this.updateCurrentQuestion();
        }
    }
    
    async updateCurrentQuestion() {
        if (!this.currentSession) return;
        
        try {
            await sessionsCollection.doc(this.currentSession.id).update({
                currentQuestion: this.currentQuestionIndex,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            console.log(`🔀 Vraag gewisseld naar: ${this.currentQuestionIndex + 1}`);
            
            // 👇 VOEG DIT TOE: Forceer volledige refresh
            this.displayCurrentQuestion();
            
            // Log de status voor debugging
            setTimeout(() => {
                console.log("Na vraagwissel - antwoorden voor deze vraag:");
                this.debugAnswersForCurrentQuestion();
            }, 500);
            
        } catch (error) {
            console.error('Fout bij updaten vraag:', error);
            this.showMessage('Fout: ' + error.message, 'error');
        }
    }

// Nieuwe helper functie
debugAnswersForCurrentQuestion() {
    console.log(`📋 Antwoorden voor vraag ${this.currentQuestionIndex + 1}:`);
    
    let count = 0;
    this.answers.forEach((answer, key) => {
        const [studentId, questionNr] = key.split('_');
        if (parseInt(questionNr) === this.currentQuestionIndex) {
            count++;
            const student = this.students.get(studentId);
            console.log(`  ${count}. ${student ? student.name : 'Onbekend'}: ${answer.answer}`);
        }
    });
    
    console.log(`Totaal: ${count} antwoord(en)`);
}
    
    async viewAnswers() {
    if (!this.currentSession) return;
    
    try {
        console.log("Bekijk antwoorden voor vraag:", this.currentQuestionIndex);
        console.log("Session ID:", this.currentSession.id);
        console.log("Aantal leerlingen in memory:", this.students.size);
        
        // Haal ALLE leerlingen op voor deze sessie
        const studentsSnapshot = await studentsCollection
            .where('sessionId', '==', this.currentSession.id)
            .get();
        
        // Maak een map van studentId -> studentName
        const studentMap = new Map();
        studentsSnapshot.forEach(doc => {
            const studentData = doc.data();
            studentMap.set(doc.id, studentData.name);
            console.log("Leerling gevonden:", doc.id, "->", studentData.name);
        });
        
        // Haal antwoorden op
        const answersSnapshot = await answersCollection
            .where('sessionId', '==', this.currentSession.id)
            .where('questionNr', '==', this.currentQuestionIndex)
            .get();
        
        if (answersSnapshot.empty) {
            this.showMessage('Nog geen antwoorden voor deze vraag.', 'info');
            return;
        }
        
        console.log("Aantal antwoorden gevonden:", answersSnapshot.size);
        
        let message = `Antwoorden voor vraag ${this.currentQuestionIndex + 1}:\n\n`;
        let count = 0;
        
        answersSnapshot.forEach(doc => {
            const answer = doc.data();
            const studentName = studentMap.get(answer.studentId) || 'Onbekende leerling';
            
            console.log("Antwoord:", {
                studentId: answer.studentId,
                studentName: studentName,
                answer: answer.answer
            });
            
            message += `${studentName}: ${answer.answer}\n`;
            count++;
        });
        
        message += `\nTotaal: ${count} antwoord(en)`;
        alert(message);
        
    } catch (error) {
        console.error('Fout bij bekijken antwoorden:', error);
        this.showMessage('Fout: ' + error.message, 'error');
    }
}

async loadQuestionnaires() {
    try {
        console.log("Questionnaires laden...");
        
        // In een echte app zou je dit van een server halen
        // Voor nu gebruiken we hardcoded opties + dynamisch laden
        
        const questionnaireSelect = document.getElementById('questionnaire-select');
        
        // Haal bestaande opties op (behalve eerste twee)
        const existingOptions = Array.from(questionnaireSelect.options).slice(2);
        
        // Voor demo: we hebben hardcoded opties in de HTML
        // In een echte app zou je hier een fetch doen naar je server
        
        this.showMessage('Vragenlijsten geladen', 'success');
        
        // Update count voor geselecteerde questionnaire
        this.updateQuestionCount();
        
    } catch (error) {
        console.error('Fout bij laden questionnaires:', error);
    }
}

// NIEUWE FUNCTIE: Handle questionnaire selectie
async handleQuestionnaireSelect(questionnaireName) {
    const textarea = document.getElementById('questions-json');
    const infoDiv = document.getElementById('questionnaire-info');
    const selector = document.querySelector('.questionnaire-selector');
    
    if (!questionnaireName || questionnaireName === 'custom') {
        // Eigen vragen modus
        infoDiv.classList.add('hidden');
        selector.classList.remove('questionnaire-loaded');
        this.selectedQuestionnaire = null;
        return;
    }
    
    try {
        console.log(`Questionnaire laden: ${questionnaireName}`);
        
        // Toon loading state
        textarea.value = 'Vragenlijst laden...';
        textarea.disabled = true;
        
        // Haal JSON op van server
        const response = await fetch(`questionnaires/${questionnaireName}`);
        
        if (!response.ok) {
            throw new Error(`Kan vragenlijst niet laden: ${response.status}`);
        }
        
        const questions = await response.json();
        
        // Formatteer JSON mooi
        const formattedJson = JSON.stringify(questions, null, 2);
        textarea.value = formattedJson;
        textarea.disabled = false;
        
        // Update UI
        infoDiv.classList.remove('hidden');
        document.getElementById('selected-questionnaire-name').textContent = 
            this.getQuestionnaireDisplayName(questionnaireName);
        
        selector.classList.add('questionnaire-loaded');
        this.selectedQuestionnaire = questionnaireName;
        
        // Update vraag count
        this.updateQuestionCount();
        
        // Focus op textarea voor bewerking
        setTimeout(() => {
            textarea.focus();
            // Plaats cursor aan het einde
            textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        }, 100);
        
        this.showMessage(`Vragenlijst "${this.getQuestionnaireDisplayName(questionnaireName)}" geladen`, 'success');
        
    } catch (error) {
        console.error('Fout bij laden questionnaire:', error);
        
        // Reset naar custom modus
        textarea.value = '';
        textarea.disabled = false;
        questionnaireSelect.value = 'custom';
        infoDiv.classList.add('hidden');
        selector.classList.remove('questionnaire-loaded');
        
        this.showMessage(`Fout bij laden: ${error.message}`, 'error');
    }
}

// NIEUWE FUNCTIE: Update vraag count
updateQuestionCount() {
    try {
        const textarea = document.getElementById('questions-json');
        const value = textarea.value.trim();
        
        if (!value) {
            document.getElementById('question-count').textContent = '0 vragen';
            return;
        }
        
        const questions = JSON.parse(value);
        const count = Array.isArray(questions) ? questions.length : 0;
        
        document.getElementById('question-count').textContent = `${count} vraag${count !== 1 ? 'en' : ''}`;
        
    } catch (error) {
        // Ongeldige JSON, toon fout
        document.getElementById('question-count').textContent = 'Ongeldige JSON';
        document.getElementById('question-count').style.color = '#ef4444';
    }
}

// NIEUWE FUNCTIE: Markeer als custom wanneer gebruiker typt
markAsCustom() {
    const select = document.getElementById('questionnaire-select');
    const infoDiv = document.getElementById('questionnaire-info');
    const selector = document.querySelector('.questionnaire-selector');
    
    if (select.value && select.value !== 'custom') {
        select.value = 'custom';
        infoDiv.classList.add('hidden');
        selector.classList.remove('questionnaire-loaded');
        this.selectedQuestionnaire = null;
    }
}

// NIEUWE FUNCTIE: Get display name voor questionnaire
getQuestionnaireDisplayName(filename) {
    const names = {
        'geschiedenis.json': 'Geschiedenis Quiz',
        'aardrijkskunde.json': 'Aardrijkskunde Quiz', 
        'wiskunde.json': 'Wiskunde Quiz',
        'nederlands.json': 'Nederlands Quiz'
    };
    
    return names[filename] || filename.replace('.json', '').replace(/_/g, ' ');
}
    
    async exportAnswers() {
        if (!this.currentSession) return;
        
        try {
            const answersSnapshot = await answersCollection
                .where('sessionId', '==', this.currentSession.id)
                .get();
            
            if (answersSnapshot.empty) {
                this.showMessage('Nog geen antwoorden om te exporteren.', 'info');
                return;
            }
            
            const exportData = {
                sessionId: this.currentSession.id,
                code: this.currentSession.code,
                title: this.currentSession.title,
                exportDate: new Date().toISOString(),
                answers: []
            };
            
            answersSnapshot.forEach(doc => {
                exportData.answers.push(doc.data());
            });
            
            // Maak download link
            const dataStr = JSON.stringify(exportData, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            
            const exportFileDefaultName = `quiz-antwoorden-${this.currentSession.code}.json`;
            
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            this.showMessage('Antwoorden geëxporteerd!', 'success');
            
        } catch (error) {
            console.error('Fout bij exporteren:', error);
            this.showMessage('Fout: ' + error.message, 'error');
        }
    }
    
    copySessionLink() {
        const link = window.location.origin + '/student.html';
        navigator.clipboard.writeText(link)
            .then(() => {
                this.showMessage('Link gekopieerd naar klembord!', 'success');
            })
            .catch(err => {
                this.showMessage('Fout bij kopiëren: ' + err, 'error');
            });
    }
    
    async endSession() {
        if (!this.currentSession) return;
        
        if (confirm('Weet je zeker dat je de sessie wilt beëindigen?\n\nLeerlingen kunnen niet meer deelnemen, maar antwoorden blijven bewaard.')) {
            try {
                await sessionsCollection.doc(this.currentSession.id).update({
                    active: false,
                    endedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                localStorage.removeItem('teacherSession');
                this.showMessage('Sessie beëindigd!', 'success');
                
                // Wacht even en ga terug naar start
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
                
            } catch (error) {
                console.error('Fout bij beëindigen sessie:', error);
                this.showMessage('Fout: ' + error.message, 'error');
            }
        }
    }
    
    showMessage(text, type = 'info') {
        // Maak een tijdelijke melding
        const messageDiv = document.createElement('div');
        messageDiv.className = `message-${type}`;
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        if (type === 'success') {
            messageDiv.style.background = 'linear-gradient(135deg, #4ade80 0%, #16a34a 100%)';
        } else if (type === 'error') {
            messageDiv.style.background = 'linear-gradient(135deg, #f43f5e 0%, #dc2626 100%)';
        } else {
            messageDiv.style.background = 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)';
        }
        
        messageDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            ${text}
        `;
        
        document.body.appendChild(messageDiv);
        
        // Verwijder na 3 seconden
        setTimeout(() => {
            messageDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 300);
        }, 3000);
    }
}

// Initialiseer de app wanneer de pagina laadt
document.addEventListener('DOMContentLoaded', () => {
    new TeacherApp();
    
    // Voeg animatie styles toe
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});

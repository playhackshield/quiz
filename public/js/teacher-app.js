class TeacherApp {
    constructor() {
        this.currentSession = null;
        this.questions = [];
        this.currentQuestionIndex = 0;
        this.students = new Map();
        this.answers = new Map();
        
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
            
            // Maak sessie in Firestore
            const sessionRef = await sessionsCollection.add({
                title: title,
                code: code,
                teacherId: teacherId,
                currentQuestion: 0,
                questions: questions,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                active: true,
                studentCount: 0
            });
            
            this.currentSession = {
                id: sessionRef.id,
                code: code,
                title: title,
                teacherId: teacherId
            };
            
            // Sla op in localStorage
            localStorage.setItem('teacherSession', JSON.stringify(this.currentSession));
            
            // Laad de sessie
            await this.loadSession(sessionRef.id);
            this.showActiveSession();
            
            // Toon succes bericht
            this.showMessage('Sessie aangemaakt! Code: ' + code, 'success');
            
        } catch (error) {
            console.error('Fout bij aanmaken sessie:', error);
            this.showMessage('Fout: ' + error.message, 'error');
            this.showSessionCreation();
        }
    }
    
    async loadSession(sessionId) {
        try {
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
            });
            
            // Luister naar leerlingen
            studentsCollection
                .where('sessionId', '==', sessionId)
                .orderBy('joinedAt', 'asc')
                .onSnapshot((snapshot) => {
                    this.students.clear();
                    snapshot.forEach(doc => {
                        this.students.set(doc.id, {
                            id: doc.id,
                            ...doc.data()
                        });
                    });
                    this.updateStudentList();
                });
            
            // Luister naar antwoorden
            answersCollection
                .where('sessionId', '==', sessionId)
                .onSnapshot((snapshot) => {
                    this.answers.clear();
                    snapshot.forEach(doc => {
                        const answer = doc.data();
                        const key = `${answer.studentId}_${answer.questionNr}`;
                        this.answers.set(key, answer);
                    });
                    this.updateStudentList();
                });
                
        } catch (error) {
            console.error('Fout bij laden sessie:', error);
            this.showMessage('Fout bij laden: ' + error.message, 'error');
        }
    }
    
    updateSessionDisplay(sessionData) {
        document.getElementById('session-code').textContent = sessionData.code;
        document.getElementById('display-code').textContent = sessionData.code;
        document.getElementById('student-count').textContent = this.students.size;
        document.getElementById('total-students').textContent = this.students.size;
        document.getElementById('total-questions').textContent = this.questions.length;
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
            const hasAnswered = Array.from(this.answers.keys()).some(key => 
                key.startsWith(student.id + '_') && 
                parseInt(key.split('_')[1]) === this.currentQuestionIndex
            );
            
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
    }
    
    updateAnswerStats() {
        const answeredCount = Array.from(this.answers.keys()).filter(key => {
            return parseInt(key.split('_')[1]) === this.currentQuestionIndex;
        }).length;
        
        document.getElementById('answered-count').textContent = answeredCount;
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
            
            this.displayCurrentQuestion();
            
        } catch (error) {
            console.error('Fout bij updaten vraag:', error);
            this.showMessage('Fout: ' + error.message, 'error');
        }
    }
    
    async viewAnswers() {
        if (!this.currentSession) return;
        
        try {
            const answersSnapshot = await answersCollection
                .where('sessionId', '==', this.currentSession.id)
                .where('questionNr', '==', this.currentQuestionIndex)
                .get();
            
            if (answersSnapshot.empty) {
                this.showMessage('Nog geen antwoorden voor deze vraag.', 'info');
                return;
            }
            
            let message = `Antwoorden voor vraag ${this.currentQuestionIndex + 1}:\n\n`;
            const answersByStudent = new Map();
            
            answersSnapshot.forEach(doc => {
                const answer = doc.data();
                if (!answersByStudent.has(answer.studentId)) {
                    answersByStudent.set(answer.studentId, []);
                }
                answersByStudent.get(answer.studentId).push(answer);
            });
            
            // Toon antwoorden per leerling
            for (const [studentId, answers] of answersByStudent.entries()) {
                const student = this.students.get(studentId);
                const studentName = student ? student.name : 'Onbekende leerling';
                
                message += `${studentName}:\n`;
                answers.forEach(answer => {
                    message += `  • ${answer.answer}\n`;
                });
                message += '\n';
            }
            
            alert(message);
            
        } catch (error) {
            console.error('Fout bij bekijken antwoorden:', error);
            this.showMessage('Fout: ' + error.message, 'error');
        }
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

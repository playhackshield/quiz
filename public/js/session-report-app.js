class SessionReportApp {
    constructor() {
        this.sessionId = null;
        this.sessionData = null;
        this.students = [];
        this.answers = [];
        this.questions = [];
        
        this.init();
    }
    
    async init() {
        try {
            // Haal sessionId uit URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            this.sessionId = urlParams.get('sessionId');
            
            if (!this.sessionId) {
                throw new Error('Geen sessie ID gevonden in URL');
            }
            
            await anonymousLogin();
            await this.loadSessionData();
            this.setupEventListeners();
            
        } catch (error) {
            console.error('Initialisatie fout:', error);
            this.showError('Fout bij laden rapport: ' + error.message);
        }
    }
    
    async loadSessionData() {
        try {
            // Laad sessie data
            const sessionDoc = await sessionsCollection.doc(this.sessionId).get();
            if (!sessionDoc.exists) {
                throw new Error('Sessie niet gevonden');
            }
            
            this.sessionData = {
                id: sessionDoc.id,
                ...sessionDoc.data(),
                createdAt: sessionDoc.data().createdAt ? sessionDoc.data().createdAt.toDate() : null,
                endedAt: sessionDoc.data().endedAt ? sessionDoc.data().endedAt.toDate() : null
            };
            
            this.questions = this.sessionData.questions || [];
            
            // Laad leerlingen
            const studentsSnapshot = await studentsCollection
                .where('sessionId', '==', this.sessionId)
                .get();
            
            this.students = [];
            studentsSnapshot.forEach(doc => {
                this.students.push({
                    id: doc.id,
                    ...doc.data(),
                    joinedAt: doc.data().joinedAt ? doc.data().joinedAt.toDate() : null
                });
            });
            
            // Laad antwoorden
            const answersSnapshot = await answersCollection
                .where('sessionId', '==', this.sessionId)
                .get();
            
            this.answers = [];
            answersSnapshot.forEach(doc => {
                this.answers.push({
                    id: doc.id,
                    ...doc.data(),
                    submittedAt: doc.data().submittedAt ? doc.data().submittedAt.toDate() : null
                });
            });
            
            // Update UI
            this.updateSessionInfo();
            this.renderQuestionsSummary();
            this.renderStudentReports();
            this.updateStatistics();
            
        } catch (error) {
            console.error('Fout bij laden sessie data:', error);
            throw error;
        }
    }
    
    updateSessionInfo() {
        // Titel en code
        document.getElementById('session-title').textContent = 
            this.sessionData.title || 'Geen titel';
        document.getElementById('session-code').textContent = 
            this.sessionData.code || '----';
        document.getElementById('session-subtitle').textContent = 
            `Details van quiz sessie: ${this.sessionData.code}`;
        
        // Datum
        if (this.sessionData.createdAt) {
            const dateStr = this.sessionData.createdAt.toLocaleDateString('nl-NL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            document.getElementById('session-date').textContent = dateStr;
        }
        
        // Duur
        if (this.sessionData.endedAt && this.sessionData.createdAt) {
            const diffMs = this.sessionData.endedAt - this.sessionData.createdAt;
            const diffMins = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMins / 60);
            const minutes = diffMins % 60;
            
            let duration = '';
            if (hours > 0) duration += `${hours}u `;
            duration += `${minutes}m`;
            
            document.getElementById('session-duration').textContent = duration;
        }
        
        // Aantal leerlingen
        document.getElementById('session-students-count').textContent = this.students.length;
        
        // Status badge
        const statusBadge = document.getElementById('session-status-badge');
        statusBadge.innerHTML = this.sessionData.active ? 
            '<span class="status-badge active">Actief</span>' : 
            '<span class="status-badge ended">Beëindigd</span>';
    }
    
    renderQuestionsSummary() {
        const container = document.getElementById('questions-summary');
        
        if (this.questions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-question-circle"></i>
                    <p>Geen vragen in deze sessie</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="questions-table-container">
                <table class="questions-table">
                    <thead>
                        <tr>
                            <th>Nr</th>
                            <th>Vraag</th>
                            <th>Type</th>
                            <th>Antwoorden</th>
                            <th>Meest gegeven antwoord</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.questions.map((question, index) => {
                            const answersForQuestion = this.answers.filter(a => a.questionNr === index);
                            const answerCount = answersForQuestion.length;
                            const participationRate = this.students.length > 0 ? 
                                Math.round((answerCount / this.students.length) * 100) : 0;
                            
                            // Vind meest voorkomende antwoord
                            let mostCommonAnswer = '-';
                            if (answersForQuestion.length > 0) {
                                const answerCounts = {};
                                answersForQuestion.forEach(a => {
                                    const answer = String(a.answer);
                                    answerCounts[answer] = (answerCounts[answer] || 0) + 1;
                                });
                                
                                const mostCommon = Object.entries(answerCounts)
                                    .sort((a, b) => b[1] - a[1])[0];
                                
                                if (mostCommon) {
                                    mostCommonAnswer = `${mostCommon[0]} (${mostCommon[1]}×)`;
                                }
                            }
                            
                            return `
                                <tr>
                                    <td class="question-number">${index + 1}</td>
                                    <td class="question-text">${question.vraag}</td>
                                    <td class="question-type">
                                        <span class="type-badge ${question.type}">
                                            ${this.getQuestionTypeLabel(question.type)}
                                        </span>
                                    </td>
                                    <td class="question-answers">
                                        <div class="answer-stats">
                                            <span class

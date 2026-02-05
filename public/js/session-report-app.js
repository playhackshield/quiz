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
                                            <span class="answer-count">${answerCount}/${this.students.length}</span>
                                            <div class="progress-bar">
                                                <div class="progress-fill" style="width: ${participationRate}%"></div>
                                            </div>
                                            <span class="participation-rate">${participationRate}%</span>
                                        </div>
                                    </td>
                                    <td class="most-common-answer">${mostCommonAnswer}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    renderStudentReports() {
        const container = document.getElementById('student-reports-container');
        
        if (this.students.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-graduate"></i>
                    <p>Geen leerlingen in deze sessie</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.students.map(student => {
            // Vind alle antwoorden van deze leerling
            const studentAnswers = this.answers.filter(a => a.studentId === student.id);
            
            // Bereken statistieken
            const totalQuestions = this.questions.length;
            const answeredCount = studentAnswers.length;
            const participationRate = totalQuestions > 0 ? 
                Math.round((answeredCount / totalQuestions) * 100) : 0;
            
            // Groepeer antwoorden per vraag
            const answersByQuestion = {};
            studentAnswers.forEach(answer => {
                answersByQuestion[answer.questionNr] = answer;
            });
            
            return `
                <div class="student-report-card">
                    <div class="student-report-header" onclick="app.toggleStudentAnswers('${student.id}')">
                        <div class="student-info">
                            <div class="student-avatar">
                                <i class="fas fa-user"></i>
                            </div>
                            <div>
                                <h3>${student.name}</h3>
                                <div class="student-meta">
                                    <span><i class="fas fa-calendar"></i> Aangemeld: ${student.joinedAt ? student.joinedAt.toLocaleTimeString('nl-NL') : '-'}</span>
                                    <span><i class="fas fa-check-circle"></i> Antwoorden: ${answeredCount}/${totalQuestions}</span>
                                    <span><i class="fas fa-chart-line"></i> Deelname: ${participationRate}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="toggle-icon">
                            <i class="fas fa-chevron-down"></i>
                        </div>
                    </div>
                    
                    <div class="student-answers-container" id="answers-${student.id}" style="display: none;">
                        ${totalQuestions > 0 ? `
                            <table class="student-answers-table">
                                <thead>
                                    <tr>
                                        <th>Vraag</th>
                                        <th>Vraag tekst</th>
                                        <th>Antwoord</th>
                                        <th>Tijd</th>
                                        <th>Correct</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${this.questions.map((question, index) => {
                                        const answer = answersByQuestion[index];
                                        const questionText = question.vraag.length > 50 ? 
                                            question.vraag.substring(0, 50) + '...' : question.vraag;
                                        
                                        let answerText = '-';
                                        let answerTime = '-';
                                        let isCorrect = '-';
                                        
                                        if (answer) {
                                            answerText = this.formatAnswer(question, answer.answer);
                                            answerTime = answer.submittedAt ? 
                                                answer.submittedAt.toLocaleTimeString('nl-NL') : '-';
                                            
                                            if (question.type === 'meerkeuze' && question.correct !== undefined) {
                                                isCorrect = answer.answer == question.correct ? 
                                                    '<span class="correct-badge">✓ Correct</span>' : 
                                                    '<span class="incorrect-badge">✗ Fout</span>';
                                            }
                                        }
                                        
                                        return `
                                            <tr class="${answer ? 'answered' : 'not-answered'}">
                                                <td class="question-nr">${index + 1}</td>
                                                <td class="question-text">${questionText}</td>
                                                <td class="student-answer">${answerText}</td>
                                                <td class="answer-time">${answerTime}</td>
                                                <td class="answer-correct">${isCorrect}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        ` : `
                            <div class="no-questions">
                                <i class="fas fa-question-circle"></i>
                                <p>Geen vragen in deze sessie</p>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    toggleStudentAnswers(studentId) {
        const container = document.getElementById(`answers-${studentId}`);
        const icon = container.previousElementSibling.querySelector('.toggle-icon i');
        
        if (container.style.display === 'none') {
            container.style.display = 'block';
            icon.className = 'fas fa-chevron-up';
        } else {
            container.style.display = 'none';
            icon.className = 'fas fa-chevron-down';
        }
    }
    
    expandAll() {
        document.querySelectorAll('.student-answers-container').forEach(container => {
            container.style.display = 'block';
        });
        document.querySelectorAll('.toggle-icon i').forEach(icon => {
            icon.className = 'fas fa-chevron-up';
        });
    }
    
    collapseAll() {
        document.querySelectorAll('.student-answers-container').forEach(container => {
            container.style.display = 'none';
        });
        document.querySelectorAll('.toggle-icon i').forEach(icon => {
            icon.className = 'fas fa-chevron-down';
        });
    }
    
    updateStatistics() {
        // Deelname percentage
        const totalPossibleAnswers = this.students.length * this.questions.length;
        const totalActualAnswers = this.answers.length;
        const participationRate = totalPossibleAnswers > 0 ? 
            Math.round((totalActualAnswers / totalPossibleAnswers) * 100) : 0;
        
        document.getElementById('participation-rate').textContent = `${participationRate}%`;
        
        // Correcte antwoorden (alleen voor meerkeuze)
        const correctAnswers = this.answers.filter(answer => {
            const question = this.questions[answer.questionNr];
            return question && 
                   question.type === 'meerkeuze' && 
                   question.correct !== undefined &&
                   answer.answer == question.correct;
        }).length;
        
        document.getElementById('correct-answers').textContent = correctAnswers;
        
        // Gemiddelde antwoordtijd
        let totalTime = 0;
        let count = 0;
        
        this.answers.forEach(answer => {
            if (answer.submittedAt && this.sessionData.createdAt) {
                const timeDiff = answer.submittedAt - this.sessionData.createdAt;
                if (timeDiff > 0) {
                    totalTime += timeDiff;
                    count++;
                }
            }
        });
        
        const avgTime = count > 0 ? Math.round(totalTime / count / 1000) : 0;
        document.getElementById('avg-response-time').textContent = `${avgTime}s`;
        
        // Meest actieve leerling
        const studentActivity = {};
        this.answers.forEach(answer => {
            studentActivity[answer.studentId] = (studentActivity[answer.studentId] || 0) + 1;
        });
        
        let topStudent = '-';
        let maxAnswers = 0;
        
        Object.entries(studentActivity).forEach(([studentId, answerCount]) => {
            if (answerCount > maxAnswers) {
                maxAnswers = answerCount;
                const student = this.students.find(s => s.id === studentId);
                if (student) {
                    topStudent = student.name;
                }
            }
        });
        
        document.getElementById('top-student').textContent = topStudent;
    }
    
    getQuestionTypeLabel(type) {
        const labels = {
            'meerkeuze': 'Meerkeuze',
            'open': 'Open vraag',
            'ja/nee': 'Ja/Nee'
        };
        return labels[type] || type;
    }
    
    formatAnswer(question, answer) {
        if (question.type === 'meerkeuze' && question.opties) {
            const index = parseInt(answer);
            if (!isNaN(index) && question.opties[index] !== undefined) {
                const letter = String.fromCharCode(65 + index);
                return `${letter}. ${question.opties[index]}`;
            }
        }
        return String(answer);
    }
    
    setupEventListeners() {
        // Print knop
        document.getElementById('print-btn').addEventListener('click', () => {
            window.print();
        });
        
        // Export knoppen
        document.getElementById('export-btn').addEventListener('click', () => this.exportToJSON());
        document.getElementById('export-json').addEventListener('click', () => this.exportToJSON());
        document.getElementById('export-csv').addEventListener('click', () => this.exportToCSV());
        document.getElementById('export-excel').addEventListener('click', () => this.exportToExcel());
        
        // Expand/collapse
        document.getElementById('expand-all-btn').addEventListener('click', () => this.expandAll());
        document.getElementById('collapse-all-btn').addEventListener('click', () => this.collapseAll());
    }
    
    exportToJSON() {
        const exportData = {
            session: this.sessionData,
            students: this.students,
            questions: this.questions,
            answers: this.answers,
            exportDate: new Date().toISOString(),
            statistics: {
                participationRate: document.getElementById('participation-rate').textContent,
                correctAnswers: parseInt(document.getElementById('correct-answers').textContent),
                avgResponseTime: document.getElementById('avg-response-time').textContent,
                topStudent: document.getElementById('top-student').textContent
            }
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        this.downloadFile(dataStr, `quiz-sessie-${this.sessionData.code}.json`, 'application/json');
    }
    
    exportToCSV() {
        // Maak CSV van antwoorden
        const headers = ['Leerling', 'Vraag Nr', 'Vraag', 'Antwoord', 'Tijdstip', 'Correct'];
        const rows = [];
        
        this.students.forEach(student => {
            const studentAnswers = this.answers.filter(a => a.studentId === student.id);
            
            studentAnswers.forEach(answer => {
                const question = this.questions[answer.questionNr];
                const row = [
                    student.name,
                    answer.questionNr + 1,
                    question ? question.vraag : '',
                    this.formatAnswer(question, answer.answer),
                    answer.submittedAt ? answer.submittedAt.toLocaleString('nl-NL') : '',
                    question && question.type === 'meerkeuze' && question.correct !== undefined ? 
                        (answer.answer == question.correct ? 'Ja' : 'Nee') : 'N/A'
                ];
                rows.push(row);
            });
        });
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        this.downloadFile(csvContent, `quiz-antwoorden-${this.sessionData.code}.csv`, 'text/csv');
    }
    
    exportToExcel() {
        try {
            // Maak werkblad
            const ws = XLSX.utils.aoa_to_sheet([
                ['Quiz Sessie Rapport', '', '', '', '', ''],
                ['Code:', this.sessionData.code, '', 'Datum:', this.sessionData.createdAt?.toLocaleDateString('nl-NL') || '', ''],
                ['Titel:', this.sessionData.title || '', '', 'Leerlingen:', this.students.length, ''],
                ['', '', '', '', '', ''],
                ['Antwoorden Overzicht', '', '', '', '', ''],
                ['Leerling', 'Vraag Nr', 'Vraag', 'Antwoord', 'Tijdstip', 'Correct']
            ]);
            
            // Voeg antwoorden toe
            const data = [];
            this.students.forEach(student => {
                const studentAnswers = this.answers.filter(a => a.studentId === student.id);
                
                studentAnswers.forEach(answer => {
                    const question = this.questions[answer.questionNr];
                    data.push([
                        student.name,
                        answer.questionNr + 1,
                        question ? question.vraag : '',
                        this.formatAnswer(question, answer.answer),
                        answer.submittedAt ? answer.submittedAt.toLocaleString('nl-NL') : '',
                        question && question.type === 'meerkeuze' && question.correct !== undefined ? 
                            (answer.answer == question.correct ? 'Ja' : 'Nee') : 'N/A'
                    ]);
                });
            });
            
            XLSX.utils.sheet_add_aoa(ws, data, { origin: -1 });
            
            // Maak werkboek en download
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Antwoorden');
            XLSX.writeFile(wb, `quiz-rapport-${this.sessionData.code}.xlsx`);
            
        } catch (error) {
            console.error('Fout bij Excel export:', error);
            this.showMessage('Fout bij exporteren naar Excel', 'error');
        }
    }
    
    downloadFile(data, filename, type) {
        const file = new Blob([data], { type: type });
        const a = document.createElement('a');
        const url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
        
        this.showMessage(`${filename} gedownload`, 'success');
    }
    
    showError(message) {
        const container = document.getElementById('student-reports-container');
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Fout bij laden</h3>
                <p>${message}</p>
                <button onclick="location.reload()" class="btn">
                    <i class="fas fa-sync-alt"></i> Probeer opnieuw
                </button>
            </div>
        `;
    }
    
    showMessage(text, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            ${text}
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialiseer app
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SessionReportApp();
});

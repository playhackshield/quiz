class ReportsApp {
    constructor() {
        this.sessions = [];
        this.filteredSessions = [];
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalPages = 1;
        this.filters = {
            date: 'all',
            status: 'all',
            search: ''
        };
        
        this.init();
    }
    
    async init() {
        try {
            await anonymousLogin();
            this.setupEventListeners();
            await this.loadSessions();
            this.setupFilters();
            
        } catch (error) {
            console.error('Initialisatie fout:', error);
            this.showError('Fout bij laden rapporten: ' + error.message);
        }
    }
    
    setupEventListeners() {
        // Filter controls
        document.getElementById('filter-date').addEventListener('change', (e) => {
            this.filters.date = e.target.value;
            this.applyFilters();
        });
        
        document.getElementById('filter-status').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.applyFilters();
        });
        
        document.getElementById('search').addEventListener('input', (e) => {
            this.filters.search = e.target.value.toLowerCase();
            this.applyFilters();
        });
        
        // Buttons
        document.getElementById('refresh-btn').addEventListener('click', () => this.loadSessions());
        document.getElementById('export-all-btn').addEventListener('click', () => this.exportAllSessions());
        document.getElementById('prev-page').addEventListener('click', () => this.previousPage());
        document.getElementById('next-page').addEventListener('click', () => this.nextPage());
    }
    
    async loadSessions() {
        try {
            this.showLoading();
            
            // Haal alle sessies op, gesorteerd op datum (nieuwste eerst)
            const snapshot = await sessionsCollection
                .orderBy('createdAt', 'desc')
                .get();
            
            this.sessions = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                this.sessions.push({
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                    endedAt: data.endedAt ? data.endedAt.toDate() : null
                });
            });
            
            console.log(`✅ ${this.sessions.length} sessies geladen`);
            
            // Update statistics
            await this.updateStatistics();
            
            // Pas filters toe
            this.applyFilters();
            
        } catch (error) {
            console.error('Fout bij laden sessies:', error);
            this.showError('Kon sessies niet laden: ' + error.message);
        }
    }
    
    applyFilters() {
        let filtered = [...this.sessions];
        
        // Datum filter
        if (this.filters.date !== 'all') {
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            
            switch(this.filters.date) {
                case 'today':
                    filtered = filtered.filter(session => 
                        session.createdAt >= startOfDay
                    );
                    break;
                    
                case 'week':
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - now.getDay());
                    startOfWeek.setHours(0, 0, 0, 0);
                    filtered = filtered.filter(session => 
                        session.createdAt >= startOfWeek
                    );
                    break;
                    
                case 'month':
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    filtered = filtered.filter(session => 
                        session.createdAt >= startOfMonth
                    );
                    break;
            }
        }
        
        // Status filter
        if (this.filters.status !== 'all') {
            filtered = filtered.filter(session => {
                if (this.filters.status === 'active') {
                    return session.active === true;
                } else if (this.filters.status === 'ended') {
                    return session.active === false || session.endedAt;
                }
                return true;
            });
        }
        
        // Zoek filter
        if (this.filters.search) {
            filtered = filtered.filter(session => {
                const searchText = this.filters.search.toLowerCase();
                return (
                    session.code.toLowerCase().includes(searchText) ||
                    (session.title && session.title.toLowerCase().includes(searchText)) ||
                    (session.id && session.id.toLowerCase().includes(searchText))
                );
            });
        }
        
        this.filteredSessions = filtered;
        this.updatePagination();
        this.renderSessionsTable();
    }
    
    renderSessionsTable() {
        const tbody = document.getElementById('sessions-table-body');
        
        if (this.filteredSessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        <i class="fas fa-inbox"></i>
                        <p>Geen sessies gevonden</p>
                        <small>Pas de filters aan of start een nieuwe sessie</small>
                    </td>
                </tr>
            `;
            return;
        }
        
        // Bepaal welke sessies op huidige pagina
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const pageSessions = this.filteredSessions.slice(startIndex, endIndex);
        
        tbody.innerHTML = pageSessions.map(session => {
            // Format datum
            const dateStr = session.createdAt.toLocaleDateString('nl-NL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Bepaal leerlingen count
            const studentCount = session.studentCount || 0;
            
            // Bepaal vragen count
            const questionCount = session.questions ? session.questions.length : 0;
            
            // Status badge
            const statusBadge = session.active ? 
                '<span class="status-badge active">Actief</span>' : 
                '<span class="status-badge ended">Beëindigd</span>';
            
            // Duur berekenen
            let duration = '-';
            if (session.endedAt && session.createdAt) {
                const diffMs = session.endedAt - session.createdAt;
                const diffMins = Math.floor(diffMs / 60000);
                duration = diffMins > 60 ? 
                    `${Math.floor(diffMins / 60)}u ${diffMins % 60}m` : 
                    `${diffMins}m`;
            }
            
            return `
                <tr class="session-row" data-session-id="${session.id}">
                    <td>
                        <span class="code-badge">${session.code}</span>
                    </td>
                    <td class="session-title">
                        ${session.title || 'Geen titel'}
                    </td>
                    <td class="session-date">
                        ${dateStr}
                        ${duration !== '-' ? `<small>${duration}</small>` : ''}
                    </td>
                    <td class="session-students">
                        <i class="fas fa-users"></i>
                        ${studentCount}
                    </td>
                    <td class="session-questions">
                        <i class="fas fa-question-circle"></i>
                        ${questionCount}
                    </td>
                    <td class="session-status">
                        ${statusBadge}
                    </td>
                    <td class="session-actions">
                        <a href="session-report.html?sessionId=${session.id}" class="btn btn-small">
                            <i class="fas fa-chart-bar"></i> Rapport
                        </a>
                        <button class="btn btn-small btn-secondary" onclick="app.deleteSession('${session.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        
        // Voeg click event toe aan rijen
        document.querySelectorAll('.session-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Alleen als niet op een button geklikt
                if (!e.target.closest('button') && !e.target.closest('a')) {
                    const sessionId = row.dataset.sessionId;
                    window.location.href = `session-report.html?sessionId=${sessionId}`;
                }
            });
        });
    }
    
    updatePagination() {
        this.totalPages = Math.ceil(this.filteredSessions.length / this.pageSize);
        
        // Update pagination controls
        document.getElementById('prev-page').disabled = this.currentPage === 1;
        document.getElementById('next-page').disabled = this.currentPage === this.totalPages;
        document.getElementById('page-info').textContent = `Pagina ${this.currentPage} van ${this.totalPages}`;
        document.getElementById('total-sessions').textContent = `${this.filteredSessions.length} sessies`;
    }
    
    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.renderSessionsTable();
            this.updatePagination();
        }
    }
    
    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.renderSessionsTable();
            this.updatePagination();
        }
    }
    
    async updateStatistics() {
        try {
            // Haal alle leerlingen en antwoorden op voor statistieken
            const [studentsSnapshot, answersSnapshot] = await Promise.all([
                studentsCollection.get(),
                answersCollection.get()
            ]);
            
            // Bereken statistieken
            const totalStudents = studentsSnapshot.size;
            const totalAnswers = answersSnapshot.size;
            const totalQuestions = this.sessions.reduce((sum, session) => 
                sum + (session.questions ? session.questions.length : 0), 0);
            const activeSessions = this.sessions.filter(s => s.active).length;
            
            // Update UI
            document.getElementById('total-students-stat').textContent = totalStudents;
            document.getElementById('total-answers-stat').textContent = totalAnswers;
            document.getElementById('total-questions-stat').textContent = totalQuestions;
            document.getElementById('active-sessions-stat').textContent = activeSessions;
            
        } catch (error) {
            console.error('Fout bij updaten statistieken:', error);
        }
    }
    
    async deleteSession(sessionId) {
        if (!confirm('Weet je zeker dat je deze sessie wilt verwijderen? Alle bijbehorende antwoorden worden ook verwijderd.')) {
            return;
        }
        
        try {
            // Verwijder sessie
            await sessionsCollection.doc(sessionId).delete();
            
            // Verwijder bijbehorende leerlingen
            const studentsSnapshot = await studentsCollection
                .where('sessionId', '==', sessionId)
                .get();
            
            const deletePromises = [];
            studentsSnapshot.forEach(doc => {
                deletePromises.push(doc.ref.delete());
            });
            
            // Verwijder bijbehorende antwoorden
            const answersSnapshot = await answersCollection
                .where('sessionId', '==', sessionId)
                .get();
            
            answersSnapshot.forEach(doc => {
                deletePromises.push(doc.ref.delete());
            });
            
            await Promise.all(deletePromises);
            
            this.showMessage('Sessie succesvol verwijderd', 'success');
            await this.loadSessions();
            
        } catch (error) {
            console.error('Fout bij verwijderen sessie:', error);
            this.showMessage('Fout bij verwijderen: ' + error.message, 'error');
        }
    }
    
    async exportAllSessions() {
        try {
            // Verzamel alle data
            const exportData = {
                exportDate: new Date().toISOString(),
                totalSessions: this.sessions.length,
                sessions: []
            };
            
            // Voor elke sessie, haal leerlingen en antwoorden op
            for (const session of this.sessions) {
                const [studentsSnapshot, answersSnapshot] = await Promise.all([
                    studentsCollection.where('sessionId', '==', session.id).get(),
                    answersCollection.where('sessionId', '==', session.id).get()
                ]);
                
                const students = [];
                studentsSnapshot.forEach(doc => {
                    students.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                const answers = [];
                answersSnapshot.forEach(doc => {
                    answers.push({
                        id: doc.id,
                        ...doc.data()
                    });
                });
                
                exportData.sessions.push({
                    ...session,
                    students,
                    answers,
                    studentCount: students.length,
                    answerCount: answers.length
                });
            }
            
            // Maak download
            const dataStr = JSON.stringify(exportData, null, 2);
            this.downloadFile(dataStr, 'quiz-sessies-all.json', 'application/json');
            
            this.showMessage('Alle sessies geëxporteerd', 'success');
            
        } catch (error) {
            console.error('Fout bij exporteren:', error);
            this.showMessage('Fout bij exporteren: ' + error.message, 'error');
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
    }
    
    showLoading() {
        const tbody = document.getElementById('sessions-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="loading-cell">
                    <div class="loading-spinner-small"></div>
                    <span>Sessies laden...</span>
                </td>
            </tr>
        `;
    }
    
    showError(message) {
        const tbody = document.getElementById('sessions-table-body');
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="error-cell">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                    <button onclick="app.loadSessions()" class="btn btn-small">
                        <i class="fas fa-sync-alt"></i> Probeer opnieuw
                    </button>
                </td>
            </tr>
        `;
    }
    
    showMessage(text, type = 'info') {
        // Implementeer een mooie notification
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
    app = new ReportsApp();
});

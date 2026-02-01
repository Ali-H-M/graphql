const SIGNIN_URL = 'https://learn.reboot01.com/api/auth/signin';
const GRAPHQL_URL = 'https://learn.reboot01.com/api/graphql-engine/v1/graphql';

const loginSection = document.getElementById('login-section');
const profileSection = document.getElementById('profile-section');
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const logoutBtn = document.getElementById('logout-btn');

document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already logged in
    const jwt = localStorage.getItem('jwt');
    if (jwt) {
        showProfile();
    } else {
        showLogin();
    }

    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
});

// ==================== AUTHENTICATION ====================

async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    errorMessage.textContent = '';

    try {
        // Encode credentials in Base64
        const credentials = btoa(`${username}:${password}`);

        // Make POST request to signin endpoint
        const response = await fetch(SIGNIN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid uersnam or password');
        }

        // Get JWT token from response
        let jwt = await response.text();

        // Clean up the JWT - remove quotes and whitespace
        jwt = jwt.trim().replace(/^["']|["']$/g, '');

        // Store JWT in localStorage
        localStorage.setItem('jwt', jwt);

        // Parse JWT to get user ID
        try {
            const payload = JSON.parse(atob(jwt.split('.')[1]));
            localStorage.setItem('userId', payload.sub);
            console.log('User ID:', payload.sub);
        } catch (parseError) {
            console.error('JWT parsing error:', parseError);
            console.error('JWT parts:', jwt.split('.'));
        }

        showProfile();

    } catch (error) {
        if (error.message === 'Invalid username or password') {
            errorMessage.textContent = 'Login failed. Please check your username/email and password.';
        } else {
            errorMessage.textContent = 'Login error. Please try again.';
        }
        console.error('Login error:', error);
    }
}

function handleLogout() {
    localStorage.removeItem('jwt');
    localStorage.removeItem('userId');
    showLogin();
}

function showLogin() {
    loginSection.style.display = 'block';
    profileSection.style.display = 'none';
    loginForm.reset();
    errorMessage.textContent = '';
}

function showProfile() {
    loginSection.style.display = 'none';
    profileSection.style.display = 'block';

    loadProfileData();
}


function formatBytes(bytes) {
    if (bytes === 0) return '0 B';

    const isNegative = bytes < 0;
    const absBytes = Math.abs(bytes);

    const k = 1000; // Use decimal
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(absBytes) / Math.log(k));

    const value = Math.round(absBytes / Math.pow(k, i) * 100) / 100;
    return (isNegative ? '-' : '') + value + ' ' + sizes[i];
}

// ==================== GRAPHQL QUERIES ====================

async function fetchGraphQL(query) {
    const jwt = localStorage.getItem('jwt');

    if (!jwt) {
        showLogin();
        return null;
    }

    try {
        const response = await fetch(GRAPHQL_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            console.error('GraphQL HTTP error:', response.status, response.statusText);
            throw new Error(`GraphQL request failed: ${response.status}`);
        }

        const result = await response.json();
        console.log('GraphQL response:', result);

        // Check for GraphQL errors
        if (result.errors) {
            console.error('GraphQL errors:', result.errors);
            throw new Error(result.errors[0].message);
        }

        return result.data;

    } catch (error) {
        console.error('GraphQL error:', error);
        return null;
    }
}

async function loadProfileData() {
    // Query 1: Basic user information
    const userQuery = `{
        user {
            id
            login
        }
    }`;

    // Query 2: XP transactions (exclude exercise XP)
    const xpQuery = `{
        transaction(
            where: {
                type: {_eq: "xp"}
                object: {type: {_neq: "exercise"}}
            }
        ) {
            amount
            createdAt
            path
            object {
                type
                name
            }
        }
    }`;

    // Query 3: Audit information
    const auditQuery = `{
        user {
            auditRatio
            totalUp
            totalDown
        }
    }`;

    // Query 4: Progress/Projects
    const progressQuery = `{
        progress(order_by: {createdAt: desc}, limit: 10) {
            grade
            path
            createdAt
        }
    }`;

    try {
        // Fetch data
        const userData = await fetchGraphQL(userQuery);
        const xpData = await fetchGraphQL(xpQuery);
        const auditData = await fetchGraphQL(auditQuery);
        const progressData = await fetchGraphQL(progressQuery);

        // Display user information
        if (userData && userData.user && userData.user.length > 0) {
            const user = userData.user[0];
            document.getElementById('user-login').textContent = user.login;
            document.getElementById('user-id').textContent = user.id;
            document.getElementById('user-login-display').textContent = user.login;
        } else {
            console.warn('No user data found or unexpected structure');
        }

        // Calculate and display total XP
        if (xpData && xpData.transaction) {
            const totalXP = xpData.transaction.reduce((sum, t) => sum + t.amount, 0);
            document.getElementById('total-xp').textContent = formatBytes(totalXP);

            // Store XP data for graph
            window.xpData = xpData.transaction;
        }

        // Display audit ratio
        if (auditData && auditData.user && auditData.user.length > 0) {
            const audit = auditData.user[0];
            document.getElementById('audit-ratio').textContent = audit.auditRatio.toFixed(2);
            document.getElementById('audits-done').textContent = Math.round(audit.totalUp / 1000);
            document.getElementById('audits-received').textContent = Math.round(audit.totalDown / 1000);

            // Store audit data for graph
            window.auditData = audit;
        }

        // Display recent projects
        if (progressData && progressData.progress) {
            displayProjects(progressData.progress);
        }

        generateGraphs();

    } catch (error) {
        console.error('Error loading profile data:', error);
    }
}

function displayProjects(projects) {
    const projectsList = document.getElementById('projects-list');
    projectsList.innerHTML = '';

    projects.forEach(project => {
        const projectCard = document.createElement('div');
        projectCard.className = 'project-item';

        const projectName = project.path.split('/').pop();
        const date = new Date(project.createdAt).toLocaleDateString();
        const status = project.grade >= 1 ? 'PASS' : 'FAIL';
        const statusClass = project.grade >= 1 ? 'status-pass' : 'status-fail';

        projectCard.innerHTML = `
            <div class="project-name">${projectName}</div>
            <div class="project-info">
                <span class="project-date">${date}</span>
                <span class="project-status ${statusClass}">${status}</span>
                <span class="project-grade">Grade: ${Math.round(project.grade * 100)}%</span>
            </div>
        `;

        projectsList.appendChild(projectCard);
    });
}

// ==================== SVG GRAPHS ====================

function generateGraphs() {
    createXPGraph();
    createAuditGraph();
}

function createXPGraph() {
    const container = document.getElementById('xp-graph');
    container.innerHTML = '';

    if (!window.xpData || window.xpData.length === 0) {
        container.innerHTML = '<p>No XP data available</p>';
        return;
    }

    // Sort by date and calculate cumulative XP
    const sortedData = [...window.xpData].sort((a, b) =>
        new Date(a.createdAt) - new Date(b.createdAt)
    );

    let cumulative = 0;
    const cumulativeData = sortedData.map(item => {
        cumulative += item.amount;
        return {
            date: new Date(item.createdAt),
            xp: cumulative,
            amount: item.amount
        };
    });

    // SVG dimensions
    const width = 1000;
    const height = 500;
    const padding = 60;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;

    // Create SVG element
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Calculate scales
    const maxXP = Math.max(...cumulativeData.map(d => d.xp));
    const minDate = cumulativeData[0].date;
    const maxDate = cumulativeData[cumulativeData.length - 1].date;
    const dateRange = maxDate - minDate;

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", width);
    bg.setAttribute("height", height);
    bg.setAttribute("fill", "rgba(14, 18, 38, 0.3)");
    svg.appendChild(bg);

    // Create axes
    const xAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    xAxis.setAttribute("x1", padding);
    xAxis.setAttribute("y1", height - padding);
    xAxis.setAttribute("x2", width - padding);
    xAxis.setAttribute("y2", height - padding);
    xAxis.setAttribute("stroke", "rgba(0, 217, 255, 0.3)");
    xAxis.setAttribute("stroke-width", "2");
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS("http://www.w3.org/2000/svg", "line");
    yAxis.setAttribute("x1", padding);
    yAxis.setAttribute("y1", padding);
    yAxis.setAttribute("x2", padding);
    yAxis.setAttribute("y2", height - padding);
    yAxis.setAttribute("stroke", "rgba(0, 217, 255, 0.3)");
    yAxis.setAttribute("stroke-width", "2");
    svg.appendChild(yAxis);

    // Create Y-axis labels
    for (let i = 0; i <= 5; i++) {
        const yValue = (maxXP / 5) * i;
        const y = height - padding - (graphHeight / 5) * i;

        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", padding - 10);
        label.setAttribute("y", y);
        label.setAttribute("text-anchor", "end");
        label.setAttribute("alignment-baseline", "middle");
        label.setAttribute("font-size", "12");
        label.setAttribute("fill", "#b0b3c1");
        label.textContent = Math.round(yValue).toLocaleString();
        svg.appendChild(label);

        // Grid line
        const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        gridLine.setAttribute("x1", padding);
        gridLine.setAttribute("y1", y);
        gridLine.setAttribute("x2", width - padding);
        gridLine.setAttribute("y2", y);
        gridLine.setAttribute("stroke", "rgba(176, 179, 193, 0.1)");
        gridLine.setAttribute("stroke-dasharray", "5,5");
        svg.appendChild(gridLine);
    }

    // Create path for line graph
    const pathData = cumulativeData.map((d, i) => {
        const x = padding + (d.date - minDate) / dateRange * graphWidth;
        const y = height - padding - (d.xp / maxXP) * graphHeight;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("stroke", "#00d9ff");
    path.setAttribute("stroke-width", "3");
    path.setAttribute("fill", "none");
    svg.appendChild(path);

    const tooltip = document.getElementById('graph-tooltip');

    cumulativeData.forEach(d => {
        const x = padding + (d.date - minDate) / dateRange * graphWidth;
        const y = height - padding - (d.xp / maxXP) * graphHeight;

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", x);
        circle.setAttribute("cy", y);
        circle.setAttribute("r", "5");
        circle.setAttribute("fill", "#00d9ff");
        circle.setAttribute("class", "graph-point");

        // Add tooltip
        circle.addEventListener('mouseenter', () => {
            const isPositive = d.amount >= 0;
            const gainedLabel = isPositive ? 'Gained' : 'Lost';
            const gainedSign = isPositive ? '+' : '';
            const gainedClass = isPositive ? 'tooltip-gained' : 'tooltip-lost';
            tooltip.innerHTML = `
                <div class="tooltip-date">${d.date.toLocaleDateString()}</div>
                <div class="tooltip-xp">Total XP: ${formatBytes(d.xp)}</div>
                <div class="${gainedClass}">${gainedLabel}: ${gainedSign}${formatBytes(d.amount)}</div>
            `;
            tooltip.classList.add('visible');
        });

        circle.addEventListener('mousemove', (e) => {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        });

        circle.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });

        svg.appendChild(circle);
    });

    const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
    title.setAttribute("x", width / 2);
    title.setAttribute("y", 30);
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("font-size", "20");
    title.setAttribute("font-weight", "bold");
    title.setAttribute("fill", "#00d9ff");
    title.textContent = "Cumulative XP Progress";
    svg.appendChild(title);

    container.appendChild(svg);
}

function createAuditGraph() {
    const container = document.getElementById('audit-graph');
    container.innerHTML = '';

    if (!window.auditData) {
        container.innerHTML = '<p>No audit data available</p>';
        return;
    }

    const audit = window.auditData;
    const auditsDone = Math.round(audit.totalUp / 1000);
    const auditsReceived = Math.round(audit.totalDown / 1000);
    const maxValue = Math.max(auditsDone, auditsReceived);

    // SVG dimensions
    const width = 1000;
    const height = 500;
    const padding = 60;
    const barHeight = 80;
    const barSpacing = 120;

    // Create SVG
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", height);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Background
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", width);
    bg.setAttribute("height", height);
    bg.setAttribute("fill", "rgba(14, 18, 38, 0.3)");
    svg.appendChild(bg);

    // Title
    const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
    title.setAttribute("x", width / 2);
    title.setAttribute("y", 30);
    title.setAttribute("text-anchor", "middle");
    title.setAttribute("font-size", "20");
    title.setAttribute("font-weight", "bold");
    title.setAttribute("fill", "#00d9ff");
    title.textContent = `Audit Ratio: ${audit.auditRatio.toFixed(2)}`;
    svg.appendChild(title);

    // Audits Done Bar
    const bar1Y = 120;
    const bar1Width = (auditsDone / maxValue) * (width - 2 * padding);

    const bar1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bar1.setAttribute("x", padding);
    bar1.setAttribute("y", bar1Y);
    bar1.setAttribute("width", bar1Width);
    bar1.setAttribute("height", barHeight);
    bar1.setAttribute("fill", "#00d99b");
    bar1.setAttribute("rx", "5");
    svg.appendChild(bar1);

    const label1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label1.setAttribute("x", padding);
    label1.setAttribute("y", bar1Y - 10);
    label1.setAttribute("font-size", "18");
    label1.setAttribute("font-weight", "bold");
    label1.setAttribute("fill", "#e4e6eb");
    label1.textContent = `Audits Done: ${auditsDone}`;
    svg.appendChild(label1);

    const value1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    value1.setAttribute("x", padding + bar1Width + 10);
    value1.setAttribute("y", bar1Y + barHeight / 2);
    value1.setAttribute("alignment-baseline", "middle");
    value1.setAttribute("font-size", "18");
    value1.setAttribute("fill", "#b0b3c1");
    value1.textContent = auditsDone;
    svg.appendChild(value1);

    // Audits Received Bar
    const bar2Y = bar1Y + barHeight + barSpacing;
    const bar2Width = (auditsReceived / maxValue) * (width - 2 * padding);

    const bar2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bar2.setAttribute("x", padding);
    bar2.setAttribute("y", bar2Y);
    bar2.setAttribute("width", bar2Width);
    bar2.setAttribute("height", barHeight);
    bar2.setAttribute("fill", "#00d9ff");
    bar2.setAttribute("rx", "5");
    svg.appendChild(bar2);

    const label2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label2.setAttribute("x", padding);
    label2.setAttribute("y", bar2Y - 10);
    label2.setAttribute("font-size", "18");
    label2.setAttribute("font-weight", "bold");
    label2.setAttribute("fill", "#e4e6eb");
    label2.textContent = `Audits Received: ${auditsReceived}`;
    svg.appendChild(label2);

    const value2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
    value2.setAttribute("x", padding + bar2Width + 10);
    value2.setAttribute("y", bar2Y + barHeight / 2);
    value2.setAttribute("alignment-baseline", "middle");
    value2.setAttribute("font-size", "18");
    value2.setAttribute("fill", "#b0b3c1");
    value2.textContent = auditsReceived;
    svg.appendChild(value2);

    container.appendChild(svg);
}

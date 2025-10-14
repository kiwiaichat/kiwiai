async function loadStats() {
  try {
    const response = await fetch("/api/stats");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load stats");
    }

    displayStats(data);
  } catch (error) {
    console.error("Error loading stats:", error);
    document.getElementById("content").innerHTML = `
                    <div class="error">
                        ❌ Failed to load statistics<br>
                        <small>${error.message}</small>
                    </div>
                `;
  }
}

function displayStats(data) {
  const content = document.getElementById("content");

  content.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-label">Total Users</div>
                        <div class="stat-value">${data.totalUsers.toLocaleString()}</div>
                        <div class="stat-description">Registered accounts</div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-label">Total Bots</div>
                        <div class="stat-value">${data.totalBots.toLocaleString()}</div>
                        <div class="stat-description">${
                          data.publicBots
                        } public, ${data.privateBots} private</div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-label">Daily Active Users</div>
                        <div class="stat-value">${data.dailyActiveUsers.toLocaleString()}</div>
                        <div class="stat-description">Active today</div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-label">7-Day Average</div>
                        <div class="stat-value">${data.averageDailyUsers.toLocaleString()}</div>
                        <div class="stat-description">Average daily active users</div>
                    </div>
                </div>

                <div class="chart-container">
                    <div class="chart-title">Daily Active Users (Last 30 Days)</div>
                    <canvas id="dailyUsersChart"></canvas>
                </div>

                <div class="last-updated">
                    Last updated: ${new Date(data.lastUpdated).toLocaleString()}
                </div>
            `;

  // Create chart
  const ctx = document.getElementById("dailyUsersChart").getContext("2d");
  const dates = Object.keys(data.dailyUserData);
  const values = Object.values(data.dailyUserData);

  new Chart(ctx, {
    type: "line",
    data: {
      labels: dates.map((date) => {
        const d = new Date(date);
        return d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }),
      datasets: [
        {
          label: "Active Users",
          data: values,
          borderColor: "#96d696",
          backgroundColor: "rgba(150, 214, 150, 0.1)",
          tension: 0.4,
          fill: true,
          pointBackgroundColor: "#96d696",
          pointBorderColor: "#060806",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 2.5,
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: "#464746",
          titleColor: "#96d696",
          bodyColor: "#fff",
          borderColor: "#96d696",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: "#888",
            precision: 0,
          },
          grid: {
            color: "rgba(150, 214, 150, 0.1)",
          },
        },
        x: {
          ticks: {
            color: "#888",
            maxRotation: 45,
            minRotation: 45,
          },
          grid: {
            color: "rgba(150, 214, 150, 0.1)",
          },
        },
      },
    },
  });
}

// Load stats on page load
loadStats();

// Refresh every 5 minutes
setInterval(loadStats, 5 * 60 * 1000);

// check if the user is an admin

fetch('/api/check_admin')
    .then(response => response.json())
    .then(data => {
        if (!data.isAdmin) {
            // redirect to home page if not admin
            window.location.href = '/';
        }
    })
    .catch(error => {
        console.error('Error checking admin status:', error);
        window.location.href = '/';
    });

// add event listener to remove bot button
document.getElementById('remove-bot-btn').addEventListener('click', () => {
    const botId = document.getElementById('remove-bot-id').value;
    fetch('/api/remove_bot', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ botId })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
    })
    .catch(error => {
        console.error('Error removing bot:', error);
    });
});

// add event listener to ban user button
document.getElementById('ban-user-btn').addEventListener('click', () => {
    const userId = document.getElementById('ban-user-id').value;
    fetch('/api/ban_user', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
    })
    .then(response => response.json())
    .then(data => {
        alert(data.message);
    })
    .catch(error => {
        console.error('Error banning user:', error);
    });
});
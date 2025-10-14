const form = document.getElementById('login-form');
        const formTitle = document.getElementById('form-title');
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirm-password');
        const submitBtn = document.getElementById('submit-btn');
        const switchLink = document.getElementById('switch-link');
        const switchAnchor = document.getElementById('switch-link-anchor');

        let isSignUp = false;

        switchAnchor.addEventListener('click', function(e) {
            e.preventDefault();
            isSignUp = !isSignUp;
            if (isSignUp) {
                formTitle.textContent = 'Sign Up';
                confirmPasswordInput.style.display = 'block';
                confirmPasswordInput.required = true;
                submitBtn.textContent = 'Sign Up';
                switchLink.innerHTML = 'Already have an account? <a href="#" id="switch-link-anchor">Sign in</a>';
                usernameInput.placeholder = 'Choose a Username';
            } else {
                formTitle.textContent = 'Sign In';
                confirmPasswordInput.style.display = 'none';
                confirmPasswordInput.required = false;
                submitBtn.textContent = 'Sign In';
                switchLink.innerHTML = 'Don\'t have an account? <a href="#" id="switch-link-anchor">Sign up</a>';
                usernameInput.placeholder = 'Username or Email';
            }
            const newAnchor = document.getElementById('switch-link-anchor');
            newAnchor.addEventListener('click', arguments.callee);
        });

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if (!username || !password || (isSignUp && !confirmPassword)) {
                alert('Please fill in all fields');
                return;
            }

            if (isSignUp) {
                if (password !== confirmPassword) {
                    alert('Passwords do not match');
                    return;
                }
                try {
                    const response = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        localStorage.setItem('userId', data.userId);
                        localStorage.setItem('authKey', data.key);
                        window.location.href = '/';
                    } else {
                        alert(data.error);
                    }
                } catch (error) {
                    alert('Registration failed');
                }
            } else {
                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        localStorage.setItem('userId', data.userId);
                        localStorage.setItem('authKey', data.key);
                        window.location.href = '/';
                    } else {
                        alert(data.error);
                    }
                } catch (error) {
                    alert('Login failed');
                }
            }
        });
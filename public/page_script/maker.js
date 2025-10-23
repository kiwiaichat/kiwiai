const userId = localStorage.getItem('userId');
        const authKey = localStorage.getItem('authKey');
        let username = '';
        let editingBotId = null;
        let botData = null;
        let resetAvatarToDefault = false;


        const authBtn = document.getElementById('auth-btn');
        if (userId) {
            authBtn.textContent = 'Profile';
            authBtn.onclick = () => window.location.href = `/profile/${userId}`;
        } else {
            authBtn.textContent = 'Login';
            authBtn.onclick = () => window.location.href = '/login';
        }

        if (!userId || !authKey) {
            alert('You must be logged in to create a bot.');
            window.location.href = '/login';
        } else {

            fetch(`/api/profile/${userId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.name) {
                        username = data.name;

                        // Move edit logic here after username is loaded
                        const urlParams = new URLSearchParams(window.location.search);
                        const editParam = urlParams.get('edit');
                        if (editParam) {
                            editingBotId = editParam;
                            api.getBot(editingBotId).then(bot => {
                                if (bot.author !== username) {
                                    alert('You do not own this bot.');
                                    window.location.href = '/';
                                    return;
                                }
                                botData = bot;

                                document.getElementById('name').value = bot.name;
                                document.getElementById('description').value = bot.description;
                                document.getElementById('status').value = bot.status;
                                document.getElementById('tags').value = bot.tags ? bot.tags.join(', ') : '';
                                document.getElementById('lorebook').value = bot.lorebook ? bot.lorebook.join(', ') : '';
                                let sys_pmt = bot.sys_pmt;

                                if (sys_pmt.includes("<|EXP_SEP|>")){
                                    document.getElementById("examples").value = sys_pmt.split("<|EXP_STR|>")[1]
                                    document.getElementById("sys_pmt").value = sys_pmt.split("<|EXP_SEP|>")[0]
                                }
                                else {
                                    document.getElementById("sys_pmt").value = sys_pmt
                                }
                                document.getElementById('greeting').value = bot.greeting;

                                document.querySelector('#maker-form h2').textContent = 'Edit Bot';

                                document.querySelector('#maker-form button[type="submit"]').textContent = 'Update Bot';

                                // Make avatar upload optional when editing
                                document.getElementById('avatar').removeAttribute('required');

                                // Update the form to show avatar is optional
                                const avatarLabel = document.createElement('small');
                                avatarLabel.textContent = ' (leave empty to keep current avatar)';
                                avatarLabel.style.color = '#888';
                                document.getElementById('avatar').parentNode.appendChild(avatarLabel);

                                // Show current bot avatar
                                const avatarPreview = document.getElementById('avatar-preview');
                                avatarPreview.src = bot.avatar || '/assets/general/noresponse.png';

                                // Show reset button when editing
                                const resetBtn = document.getElementById('reset-avatar-btn');
                                resetBtn.style.display = 'block';

                                const deleteBtn = document.createElement('button');
                                deleteBtn.type = 'button';
                                deleteBtn.className = 'submit-btn';
                                deleteBtn.textContent = 'Delete Bot';
                                deleteBtn.style.backgroundColor = '#d69696';
                                deleteBtn.onclick = () => deleteBot(editingBotId);
                                document.getElementById('maker-form').appendChild(deleteBtn);
                            }).catch(error => {
                                console.error(error);
                                alert('Failed to load bot.');
                                window.location.href = '/';
                            });
                        }
                    } else {
                        alert('Failed to load user data.');
                    }
                })
                .catch(error => {
                    console.error('Error fetching user data:', error);
                    alert('Failed to load user data.');
                });
        }

        function resizeImage(file, maxWidth, maxHeight) {
            return new Promise((resolve, reject) => {
                // Check file size first (5MB limit)
                if (file.size > 5 * 1024 * 1024) {
                    reject(new Error('Image too large. Maximum size: 5MB'));
                    return;
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();

                img.onload = function() {
                    // Calculate new dimensions while maintaining aspect ratio
                    let { width, height } = img;

                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width *= ratio;
                        height *= ratio;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Draw and resize the image
                    ctx.drawImage(img, 0, 0, width, height);

                    // Convert to data URL with high quality
                    const dataURL = canvas.toDataURL('image/png', 0.9);
                    resolve(dataURL);
                };

                img.onerror = function() {
                    reject(new Error('Invalid image file'));
                };

                // Create object URL for the image
                img.src = URL.createObjectURL(file);
            });
        }

        // Avatar preview functionality
        const avatarInput = document.getElementById('avatar');
        const avatarPreview = document.getElementById('avatar-preview');
        const resetAvatarBtn = document.getElementById('reset-avatar-btn');

        // Make the preview image clickable
        avatarPreview.addEventListener('click', () => {
            avatarInput.click();
        });

        // Update preview when file is selected
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    avatarPreview.src = e.target.result;
                    resetAvatarToDefault = false; // Clear reset flag when new file is selected
                };
                reader.readAsDataURL(file);
            }
        });

        // Handle reset avatar button
        resetAvatarBtn.addEventListener('click', () => {
            resetAvatarToDefault = true;
            avatarPreview.src = '/assets/general/noresponse.png';
            avatarInput.value = ''; // Clear file input
            showNotification('Avatar will be reset to default when you update the bot.', 'info');
        });

        document.getElementById('maker-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            if (!username) {
                showNotification('User data not loaded.', 'error');
                return;
            }
            const avatarInput = document.getElementById('avatar');

            // Check if user wants to reset to default
            if (resetAvatarToDefault) {
                submitForm('DEFAULT');
                return;
            }

            if (avatarInput.files[0]) {
                try {
                    // Check NSFW via backend API
                    showNotification('Checking image...', 'info');

                    const formData = new FormData();
                    formData.append('file', avatarInput.files[0]);

                    const nsfwResponse = await fetch('/api/check-nsfw', {
                        method: 'POST',
                        body: formData
                    });

                    if (!nsfwResponse.ok) {
                        throw new Error('Failed to check image');
                    }

                    const nsfwResult = await nsfwResponse.json();

                    if (!nsfwResult.safe) {
                        showNotification(
                            `❌ Image Upload Blocked\n\n${nsfwResult.reason}\n\nPlease choose a different image that complies with our content policy.`,
                            'error'
                        );
                        return;
                    }

                    const resizedImage = await resizeImage(avatarInput.files[0], 512, 512);
                    submitForm(resizedImage);
                } catch (error) {
                    showNotification('Error processing image: ' + error.message, 'error');
                }
            } else {
                submitForm('');
            }
        });

        async function submitForm(avatarData) {
            const submitBtn = document.querySelector('.submit-btn');
            const originalBtnText = submitBtn.textContent;

            let system_prompt = document.getElementById('sys_pmt').value.trim()

            if (document.getElementById("examples").value != ""){
                system_prompt =
                `
                ${system_prompt}
                <|EXP_SEP|>
                The following are examples of dialouge between the character and the use.
                Analyze the speech patterns, style of speaking and general tone and character of the example dialouge's character. 
                Attempt to match the example dialouge's character in your own writing as closely as possible.
                The examples are as follows:
                <|EXP_STR|>
                ${document.getElementById("examples").value}

                `
            }

            const formData = {
                name: document.getElementById('name').value.trim(),
                description: document.getElementById('description').value.trim(),
                author: username,
                status: document.getElementById('status').value,
                tags: document.getElementById('tags').value.trim().split(',').map(tag => tag.trim()).filter(tag => tag),
                lorebook: document.getElementById('lorebook').value.trim().split(',').map(url => url.trim()).filter(url => url),
                sys_pmt: system_prompt,
                greeting: document.getElementById('greeting').value.trim(),
                chats: editingBotId ? (botData.chats || '') : ''
            };

            // Handle avatar: include if we have new data, creating new bot, or resetting to default
            if (avatarData === 'DEFAULT') {
                formData.avatar = 'DEFAULT';
            } else if (avatarData || !editingBotId) {
                formData.avatar = avatarData;
            }

            try {
                // Disable button and show loading state
                submitBtn.disabled = true;
                submitBtn.textContent = editingBotId ? 'Updating...' : 'Creating...';

                if (editingBotId) {
                    await api.updateBot(editingBotId, formData);
                    showNotification('Bot updated successfully!', 'success');
                    setTimeout(() => window.location.href = '/', 1000);
                } else {
                    const response = await fetch('/api/upload-bot', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': userId,
                            'x-auth-key': authKey
                        },
                        body: JSON.stringify(formData)
                    });
                    const result = await response.json();
                    if (!response.ok) {
                        // Enhanced error display
                        if (result.error && result.error.includes('inappropriate')) {
                            showNotification(
                                '❌ Image Upload Failed\n\n' + result.error + '\n\nPlease choose a different image.',
                                'error'
                            );
                        } else {
                            showNotification(result.error || 'Failed to create bot.', 'error');
                        }
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalBtnText;
                        return;
                    }
                    showNotification('Bot created successfully!', 'success');
                    setTimeout(() => window.location.href = '/', 1000);
                }
            } catch (error) {
                console.error('Error saving bot:', error);
                showNotification('Error saving bot: ' + error.message, 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        }

        function showNotification(message, type = 'info') {
            // Remove any existing notifications
            const existingNotif = document.querySelector('.notification-overlay');
            if (existingNotif) {
                existingNotif.remove();
            }

            // Create notification overlay
            const overlay = document.createElement('div');
            overlay.className = 'notification-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            const notification = document.createElement('div');
            notification.className = 'notification';
            notification.style.cssText = `
                background: #464746;
                color: ${type === 'error' ? '#d67676' : '#96d696'};
                padding: 30px;
                border-radius: 10px;
                max-width: 500px;
                width: 90%;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                text-align: center;
                white-space: pre-line;
                line-height: 1.6;
                border: 2px solid ${type === 'error' ? '#d67676' : '#96d696'};
            `;
            notification.textContent = message;

            overlay.appendChild(notification);
            document.body.appendChild(overlay);

            // Auto-remove on click or after delay
            overlay.onclick = () => overlay.remove();
            if (type === 'success') {
                setTimeout(() => overlay.remove(), 3000);
            }
        }

        async function deleteBot(botId) {
            if (confirm('Are you sure you want to delete this bot? This action cannot be undone.')) {
                try {
                    await api.deleteBot(botId);
                    alert('Bot deleted successfully!');
                    window.location.href = '/';
                } catch (error) {
                    alert('Failed to delete bot.');
                }
            }
        }
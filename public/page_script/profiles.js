const authBtn = document.getElementById("auth-btn");
const profileDropdown = document.getElementById("profile-dropdown");
const userId = localStorage.getItem("userId");

let currentProfileData = null;

if (userId) {
  authBtn.style.display = "none";
  const userPfp = document.createElement("img");
  userPfp.className = "user-pfp";
  userPfp.src = "/assets/users/default.png";
  userPfp.alt = "User Profile";
  userPfp.onclick = () => (window.location.href = `/profile/${userId}`);

  fetch(`/api/profile/${userId}`)
    .then((response) => response.json())
    .then((userData) => {
      if (userData.avatar) {
        userPfp.src = userData.avatar;
      }
    })
    .catch(console.error);

  document.getElementById("nav-right").appendChild(userPfp);
} else {
  authBtn.textContent = "Login";
  authBtn.onclick = () => (window.location.href = "/login");
}

function toggleDropdown() {
  const dropdownMenu = document.getElementById("dropdown-menu");
  dropdownMenu.classList.toggle("show");
}

// Enhanced mobile dropdown handling
document.addEventListener("click", function (event) {
  const dropdown = document.querySelector(".dropdown");
  const dropdownMenu = document.getElementById("dropdown-menu");
  if (!dropdown.contains(event.target)) {
    dropdownMenu.classList.remove("show");
  }
});

// Close dropdown on touch outside (mobile)
document.addEventListener(
  "touchstart",
  function (event) {
    const dropdown = document.querySelector(".dropdown");
    const dropdownMenu = document.getElementById("dropdown-menu");
    if (dropdown && !dropdown.contains(event.target)) {
      dropdownMenu.classList.remove("show");
    }
  },
  { passive: true }
);

function openEditProfile() {
  const modal = document.getElementById("edit-profile-modal");
  const bioInput = document.getElementById("edit-bio");

  if (currentProfileData) {
    bioInput.value = currentProfileData.bio || "";
  }

  modal.style.display = "block";
  document.getElementById("dropdown-menu").classList.remove("show");
}

function closeEditProfile() {
  const modal = document.getElementById("edit-profile-modal");
  modal.style.display = "none";
}

function handleAvatarChange(input) {
  const display = document.getElementById("avatar-display");
  if (input.files && input.files[0]) {
    display.textContent = input.files[0].name;
  } else {
    display.textContent = "Choose avatar image...";
  }
}

async function compressImage(file, maxSizeKB = 500) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = function () {
      let { width, height } = calculateDimensions(img.width, img.height, 400);
      let quality = 0.8;

      function tryCompress() {
        canvas.width = width;
        canvas.height = height;

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataURL = canvas.toDataURL("image/jpeg", quality);
        const sizeKB = (dataURL.length * 3) / 4 / 1024;

        console.log(
          `Image size: ${Math.round(
            sizeKB
          )}KB, Quality: ${quality}, Dimensions: ${width}x${height}`
        );

        if (sizeKB <= maxSizeKB || quality <= 0.1) {
          resolve(dataURL);
          return;
        }

        if (quality > 0.3) {
          quality -= 0.1;
        } else {
          width = Math.floor(width * 0.8);
          height = Math.floor(height * 0.8);
          quality = 0.8;

          if (width < 100 || height < 100) {
            resolve(dataURL);
            return;
          }
        }

        setTimeout(tryCompress, 10);
      }

      tryCompress();
    };

    img.onerror = function () {
      resolve(null);
    };

    const reader = new FileReader();
    reader.onload = function (e) {
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function calculateDimensions(originalWidth, originalHeight, maxDimension) {
  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { width: originalWidth, height: originalHeight };
  }

  const ratio = Math.min(
    maxDimension / originalWidth,
    maxDimension / originalHeight
  );
  return {
    width: Math.floor(originalWidth * ratio),
    height: Math.floor(originalHeight * ratio),
  };
}

async function handleProfileFormSubmit(e) {
  e.preventDefault();

  const bio = document.getElementById("edit-bio").value;
  const avatarFile = document.getElementById("edit-avatar").files[0];
  const submitBtn = e.target.querySelector('button[type="submit"]');

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  let avatarData = null;
  if (avatarFile) {
    // Check NSFW via backend API
    submitBtn.textContent = "Checking image...";

    try {
      const formData = new FormData();
      formData.append("file", avatarFile);

      const nsfwResponse = await fetch("/api/check-nsfw", {
        method: "POST",
        body: formData,
      });

      if (!nsfwResponse.ok) {
        throw new Error("Failed to check image");
      }

      const nsfwResult = await nsfwResponse.json();

      if (!nsfwResult.safe) {
        showProfileNotification(
          `❌ Avatar Upload Blocked\n\n${nsfwResult.reason}\n\nPlease choose a different image that complies with our content policy.`,
          "error"
        );
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
        return;
      }
    } catch (error) {
      console.error("Error checking NSFW:", error);
      showProfileNotification(
        "Error checking image. Please try again.",
        "error"
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Changes";
      return;
    }

    submitBtn.textContent = "Compressing image...";

    try {
      avatarData = await compressImage(avatarFile);
      if (!avatarData) {
        showProfileNotification(
          "Error processing image. Please try a different image.",
          "error"
        );
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
        return;
      }
    } catch (error) {
      console.error("Error compressing image:", error);
      showProfileNotification(
        "Error processing image. Please try again.",
        "error"
      );
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Changes";
      return;
    }
  }

  submitBtn.textContent = "Uploading...";

  try {
    const response = await fetch("/api/profile/update", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": localStorage.getItem("userId"),
        "x-auth-key": localStorage.getItem("authKey"),
      },
      body: JSON.stringify({
        bio: bio,
        avatar: avatarData,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      showProfileNotification("Profile updated successfully!", "success");
      closeEditProfile();

      setTimeout(() => window.location.reload(), 1000);
    } else {
      // Enhanced error display for NSFW content
      if (data.error && data.error.includes("inappropriate")) {
        showProfileNotification(
          "❌ Avatar Upload Failed\n\n" +
            data.error +
            "\n\nPlease choose a different image.",
          "error"
        );
      } else {
        showProfileNotification(
          data.error || "Error updating profile.",
          "error"
        );
      }
    }
  } catch (error) {
    console.error("Error updating profile:", error);
    if (
      error.message.includes("Failed to fetch") ||
      error.name === "TypeError"
    ) {
      showProfileNotification(
        "Upload failed - image may be too large. Please try a smaller image.",
        "error"
      );
    } else {
      showProfileNotification(
        "Error updating profile. Please try again.",
        "error"
      );
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save Changes";
  }
}

function showProfileNotification(message, type = "info") {
  // Remove any existing notifications
  const existingNotif = document.querySelector(".profile-notification-overlay");
  if (existingNotif) {
    existingNotif.remove();
  }

  // Create notification overlay
  const overlay = document.createElement("div");
  overlay.className = "profile-notification-overlay";
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

  const notification = document.createElement("div");
  notification.className = "profile-notification";
  notification.style.cssText = `
                    background: #464746;
                    color: ${type === "error" ? "#d67676" : "#96d696"};
                    padding: 30px;
                    border-radius: 10px;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                    text-align: center;
                    white-space: pre-line;
                    line-height: 1.6;
                    border: 2px solid ${
                      type === "error" ? "#d67676" : "#96d696"
                    };
                `;
  notification.textContent = message;

  overlay.appendChild(notification);
  document.body.appendChild(overlay);

  // Auto-remove on click or after delay
  overlay.onclick = () => overlay.remove();
  if (type === "success") {
    setTimeout(() => overlay.remove(), 3000);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const editForm = document.getElementById("edit-profile-form");
  if (editForm) {
    editForm.addEventListener("submit", handleProfileFormSubmit);
  }
});

function logout() {
  if (confirm("Are you sure you want to logout?")) {
    localStorage.removeItem("userId");
    localStorage.removeItem("authKey");
    window.location.href = "/login";
  }
}

async function deleteAccount() {
  const confirmation = prompt('Type "DELETE" to confirm account deletion:');
  if (confirmation !== "DELETE") {
    alert("Account deletion cancelled.");
    return;
  }

  if (
    !confirm(
      "Are you absolutely sure? This action cannot be undone. All your bots and data will be permanently deleted."
    )
  ) {
    return;
  }

  try {
    const response = await fetch("/api/delete-account", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": localStorage.getItem("userId"),
        "x-auth-key": localStorage.getItem("authKey"),
      },
    });

    const data = await response.json();

    if (response.ok) {
      alert("Account deleted successfully.");
      localStorage.removeItem("userId");
      localStorage.removeItem("authKey");
      window.location.href = "/";
    } else {
      alert(data.error || "Error deleting account.");
    }
  } catch (error) {
    console.error("Error deleting account:", error);
    alert("Error deleting account. Please try again.");
  }
}

const profile = window.location.pathname.split("/")[2];
if (profile) {
  const cards = document.getElementById("cards");
  showSkeletons(cards, 6);

  const headers = {};
  const authKey = localStorage.getItem("authKey");
  const currentUserId = localStorage.getItem("userId");
  if (authKey && currentUserId) {
    headers["x-auth-key"] = authKey;
    headers["x-user-id"] = currentUserId;
  }

  fetch(`/api/profile/${profile}`, { headers })
    .then((response) => response.json())
    .then((data) => {
      if (data.error) {
        console.error(data.error);
        return;
      }
      const profileDiv = document.querySelector(".profile");
      profileDiv.querySelector("img").src =
        data.avatar || "/assets/general/noresponse.png";
      document.getElementById("user-name").textContent = data.name;
      window.title = data.name + "'s profile - KiwiAI";
      document.getElementById("user-description").textContent = data.bio || "";

      document.getElementById("bots-title").textContent = `${data.name}'s bots`;

      const loggedInUserId = localStorage.getItem("userId");
      if (
        loggedInUserId &&
        (loggedInUserId === profile || loggedInUserId === data.id)
      ) {
        currentProfileData = data;

        document.getElementById("auth-btn").style.display = "none";
        document.getElementById("profile-dropdown").style.display =
          "inline-block";
      }

      const cards = document.getElementById("cards");
      cards.innerHTML = "";
      data.bots.forEach((bot) => {
        const card = document.createElement("div");
        card.className = "card";

        const viewCount = typeof bot.views === "number" ? bot.views : 0;
        const viewText =
          viewCount === 1 ? "1 view" : `${viewCount.toLocaleString()} views`;

        // Add private badge if bot is private
        const privateBadge =
          bot.status === "private"
            ? '<span class="private-badge">🔒 Private</span>'
            : "";

        card.innerHTML = `
                            <img src="${
                              bot.avatar || "/assets/general/noresponse.png"
                            }" alt="Bot Avatar" class="avatar">
                            <span id="name">${bot.name}${privateBadge}</span>
                            <span id="description">${bot.description}</span>
                            <span id="author">${bot.author}</span>
                            <span id="views">${viewText}</span>
                        `;
        // Enhanced mobile card interactions
        let touchStartTime = 0;
        let touchMoved = false;

        card.addEventListener(
          "touchstart",
          (e) => {
            touchStartTime = Date.now();
            touchMoved = false;
            if (window.innerWidth <= 768) {
              card.style.transform = "translateY(-2px) scale(0.98)";
            }
          },
          { passive: true }
        );

        card.addEventListener(
          "touchmove",
          () => {
            touchMoved = true;
            if (window.innerWidth <= 768) {
              card.style.transform = "";
            }
          },
          { passive: true }
        );

        card.addEventListener(
          "touchend",
          (e) => {
            if (window.innerWidth <= 768) {
              card.style.transform = "";
            }

            const touchDuration = Date.now() - touchStartTime;
            if (!touchMoved && touchDuration < 300) {
              handleCardClick();
            }
          },
          { passive: true }
        );

        card.addEventListener("click", () => {
          if (!("ontouchstart" in window)) {
            handleCardClick();
          }
        });

        function handleCardClick() {
          const loggedInUserId = localStorage.getItem("userId");
          if (loggedInUserId && loggedInUserId === profile) {
            window.location.href = `/maker?edit=${bot.id}`;
          } else {
            window.location.href = `/chat/${bot.id}`;
          }
        }
        cards.appendChild(card);
      });
    })
    .catch((error) => console.error("Error fetching profile:", error));
}

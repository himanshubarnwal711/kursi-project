let activeStoryId = null; // This will keep track of the currently viewed story in the popup
let activeUserId = null; // This will keep track of the currently viewed user in the popup

const userId = localStorage.getItem('userId');
if (!userId) {
  alert("Not logged in!");
  window.location.href = 'login.html';
}

async function fetchUserData() {
  try {
    const response = await fetch(`http://localhost:3000/user/${userId}`);
    const data = await response.json();

    if (data.name && data.email && data.photoUrl && data.city && data.aboutMe) {
      document.getElementById('username').textContent = data.name;
      document.getElementById('useremail').textContent = data.email;
      document.getElementById('profilePhoto').src = data.photoUrl;
      document.getElementById('city').textContent = data.city;

      const aboutWithEmoji = data.aboutMe.replace(
        /([\u231A-\uD83E\uDDFF]+)/g,
        (match) => `<span>${match}</span>`
      );
      document.getElementById('aboutMe').innerHTML = aboutWithEmoji;
    } else {
      throw new Error("Incomplete user data received.");
    }
  } catch (err) {
    console.error("Error fetching user data:", err);
    alert("Failed to load profile.");
  }
}

function openPasswordPopup() {
  document.getElementById("passwordPopup").style.display = "block";
}

function closePasswordPopup() {
  document.getElementById("passwordPopup").style.display = "none";
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("retypePassword").value = "";
}

async function updatePassword() {
  const currentPassword = document.getElementById('currentPassword').value.trim();
  const newPassword = document.getElementById('newPassword').value.trim();
  const retypePassword = document.getElementById('retypePassword').value.trim();

  if (!currentPassword || !newPassword || !retypePassword) {
    return alert("Please fill all fields.");
  }

  if (newPassword !== retypePassword) {
    return alert("New passwords do not match.");
  }

  try {
    const res = await fetch(`http://localhost:3000/update-password/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const result = await res.json();
    if (result.success) {
      alert("Password updated successfully!");
      closePasswordPopup();
    } else {
      alert(result.message || "Failed to update password.");
    }
  } catch (err) {
    console.error("Password update error:", err);
    alert("Something went wrong.");
  }
}

function logout() {
  localStorage.removeItem('userId');
  window.location.href = 'login.html';
}


async function postStory() {
  const storyText = document.getElementById('storyText').value.trim();
  const photoInput = document.getElementById('storyPhoto');
  const file = photoInput.files[0];

  if (!storyText) return alert("Please write your story.");
  if (storyText.length > 1000) return alert("Story can't exceed 1000 characters.");

  if (file && file.size > 5 * 1024 * 1024) {
    return alert("Photo must be under 5MB.");
  }

  const formData = new FormData();
  formData.append('userId', userId);
  formData.append('storyText', storyText);
  if (file) formData.append('photo', file);

  try {
    const response = await fetch('http://localhost:3000/post-story', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      alert("Story posted!");
      document.getElementById('storyText').value = "";
      document.getElementById('storyPhoto').value = "";
    } else {
      alert(result.message || "Failed to post story.");
    }
  } catch (err) {
    console.error("Story post error:", err);
    alert("Something went wrong.");
  }
}

function previewPhoto(event) {
  const file = event.target.files[0];
  const preview = document.getElementById('photoPreview');

  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  } else {
    preview.src = '';
    preview.style.display = 'none';
  }
}

fetchUserData();

document.addEventListener("DOMContentLoaded", () => {
  const feed = document.getElementById("storyFeed");
  const spinner = document.getElementById("spinner");

  fetch('http://localhost:3000/get-stories')
    .then(async res => {
      const contentType = res.headers.get("content-type");

      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Invalid JSON response. Raw response:", text);
        throw new Error("Expected JSON but got something else");
      }

      return res.json();
    })
    .then(stories => {
      feed.innerHTML = "";
      spinner.classList.add("hidden");

      stories.reverse().forEach(story => {
        const card = document.createElement("div");
        card.className = "story-card";

        const storyDate = story.dateTime
          ? new Date(story.dateTime).toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            })
          : "Unknown date";

        card.innerHTML = `
          <div class="story-header">
            <div class="story-user-info">
              ${story.userPhoto ? `<img src="${story.userPhoto}" class="user-photo user-info-trigger cursor-pointer" data-userid="${story.userId}" loading="lazy" />` : ""}
              <div class="story-username user-info-trigger cursor-pointer" data-userid="${story.userId}">${story.username || "Unknown"}</div>
            </div>
            <div class="story-date">${storyDate}</div>
          </div>
          ${story.photoUrl ? `<img src="${story.photoUrl}" class="story-photo" loading="lazy" />` : ""}
          <div class="story-text">${emojify(story.storyText || "")}</div>

          <div class="mt-3 text-right">
            <button onclick="openCommentsPopup('${story.storyId}')" class="flex items-center gap-1 text-sm text-blue-600 hover:underline hover:scale-105 transition-transform">
              💬 Comments
            </button>
          </div>

        `;

        feed.appendChild(card);
      });

      // ✅ Attach event listeners AFTER all cards are rendered
      document.querySelectorAll('.user-info-trigger').forEach(el => {
        el.addEventListener('click', async (e) => {
          const userId = e.target.dataset.userid;
          if (userId) {
            const userDetails = await fetchUserBio(userId);
            showUserBioModal(userDetails);
          }
        });
      });
    })
    .catch(err => {
      console.error("Error loading stories:", err);
      spinner.innerText = "Failed to load stories.";
    });
});


function emojify(text) {
  return text
    .replace(/:\)/g, "😊")
    .replace(/:\(/g, "😢")
    .replace(/:D/g, "😄")
    .replace(/<3/g, "❤️");
}

const myStoriesBtn = document.getElementById("myStoriesBtn");
const myStoriesPopup = document.getElementById("myStoriesPopup");
const myStoriesList = document.getElementById("myStoriesList");
const closePopupBtn = document.getElementById("closePopupBtn");

myStoriesBtn.addEventListener("click", async () => {
  try {
    const res = await fetch('http://localhost:3000/get-stories'); // Or your deployed URL
    const stories = await res.json();

    // Filter user's stories
    const userId = localStorage.getItem("userId"); // or however you're storing logged-in user
    const userStories = stories.filter(story => story.userId === userId);

    // Clear existing
    myStoriesList.innerHTML = "";

    // Display user's stories
    userStories.forEach(story => {
      const card = document.createElement("div");
      card.className = "story-card";
    
      const storyDate = story.dateTime
        ? new Date(story.dateTime).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
        : "Unknown date";
    
      card.innerHTML = `
        <div class="story-header">
          <div class="story-user-info">
            ${story.userPhoto ? `<img src="${story.userPhoto}" class="user-photo" />` : ""}
            <div class="story-username">${story.username || "Unknown"}</div>
          </div>
          <div class="story-date">${storyDate}</div>
        </div>
        ${story.photoUrl ? `<img src="${story.photoUrl}" class="story-photo" loading="lazy" />` : ""}
        <div class="story-text">${emojify(story.storyText || "")}</div>
        <button class="delete-story-btn" data-id="${story.storyId}">🗑️ Delete</button>
      `;
    
      myStoriesList.appendChild(card);
    });
    // Add delete functionality
    document.querySelectorAll('.delete-story-btn').forEach(button => {
      button.addEventListener('click', async (e) => {
        const storyId = e.target.getAttribute('data-id');
        if (!confirm("Are you sure you want to delete this story?")) return;
    
        try {
          const res = await fetch(`http://localhost:3000/story/${storyId}`, {
            method: 'DELETE'
          });
    
          if (res.ok) {
            e.target.closest(".story-card").remove();
          } else {
            alert("Failed to delete story.");
          }
        } catch (err) {
          console.error("Error deleting story:", err);
          alert("Server error while deleting.");
        }
      });
    });
    

    myStoriesPopup.classList.remove("hidden");
  } catch (err) {
    console.error("Error fetching user stories:", err);
    myStoriesList.innerHTML = "<p>Failed to load your stories.</p>";
    myStoriesPopup.classList.remove("hidden");
  }
});

closePopupBtn.addEventListener("click", () => {
  myStoriesPopup.classList.add("hidden");
});


async function fetchUserBio(userId) {
  try {
    const res = await fetch(`http://localhost:3000/user/${userId}`);
    if (!res.ok) throw new Error('Failed to fetch user bio');
    return await res.json(); // Should contain name, email, city, country, aboutMe, photoUrl
  } catch (err) {
    console.error(err);
    return null;
  }
}

function showUserBioModal(data) {
  if (!data) return;

  const content = `
    <p><strong class="text-blue-600">Name:</strong> ${data.name || "N/A"}</p>
    <p><strong class="text-blue-600">Email:</strong> ${data.email}</p>
    <p><strong class="text-blue-600">City:</strong> ${data.city}</p>
    <p><strong class="text-blue-600">Country:</strong> ${data.country}</p>
    <p><strong class="text-blue-600">About:</strong> ${data.aboutMe}</p>
  `;

  document.getElementById("userBioContent").innerHTML = content;
  document.getElementById("userBioModal").classList.remove("hidden");

  document.getElementById("closeUserBioModal").addEventListener("click", () => {
    document.getElementById("userBioModal").classList.add("hidden");
  });  
}

// Open Comments Popup and Load Comments
function openCommentsPopup(storyId) {
  activeStoryId = storyId; // Set the active storyId globally
  document.getElementById("commentsPopup").style.display = "block";
  fetchComments(storyId);
}

// Fetch Comments from Backend
async function fetchComments(storyId) {
  const response = await fetch(`http://localhost:3000/get-comments/${storyId}`);
  const comments = await response.json();
  
  const commentsList = document.getElementById("commentsList");
  commentsList.innerHTML = ""; // Clear existing comments

  comments.forEach(comment => {
    const commentDiv = document.createElement('div');
    commentDiv.classList.add('comment');
    commentDiv.innerHTML = `
      <div class="comment-header">
        <img src="${comment.userPhoto}" alt="${comment.userName}" class="user-photo"/>
        <div class="user-info">
          <strong>${comment.userName}</strong>
          <p>${comment.comment}</p>
        </div>
        <small class="comment-time">
          ${comment.dateTime
            ? new Date(comment.dateTime).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              })
            : "Unknown date"}
        </small>
      </div>
    `;
    commentsList.appendChild(commentDiv);
  });  
}

// Post a New Comment
async function postComment() {
  const commentText = document.getElementById("commentText").value;
  if (!commentText || !activeStoryId) return;

  const userId = localStorage.getItem("userId"); // Assuming you store it in localStorage

  const response = await fetch('http://localhost:3000/add-comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storyId: activeStoryId,
      comment: commentText,
      userId: userId
    })
  });

  if (response.ok) {
    document.getElementById("commentText").value = "";
    fetchComments(activeStoryId); // Reload comments
  } else {
    console.error("Failed to post comment");
  }
}


// Close the Comments Popup
function closeCommentsPopup() {
  document.getElementById("commentsPopup").style.display = "none";
  document.getElementById("commentText").value = "";         // Clear input
  document.getElementById("commentsList").innerHTML = "";    // Clear comment list
}

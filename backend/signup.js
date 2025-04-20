const sendOtpBtn = document.getElementById('sendOtpBtn');
const emailInput = document.getElementById('email');
const otpSection = document.querySelector('.otp-section');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const otpInput = document.getElementById('otp'); // OTP input field

const passwordInput = document.getElementById('password');
const retypeInput = document.getElementById('retypePassword');
const registerBtn = document.getElementById('registerBtn');

sendOtpBtn.addEventListener('click', () => {
  const email = emailInput.value.trim();

  if (!email) {
    alert("Please enter an email address.");
    return;
  }

  // Send OTP to backend
  fetch('http://localhost:3000/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail: email })
  })
    .then(response => response.json())
    .then(data => {
      if (data.otp) {
        // console.log('OTP sent:', data.otp); // Log OTP for debugging (optional)
        alert("OTP sent to " + email);
        otpSection.style.display = 'flex'; // Show OTP input & Verify button
      } else {
        alert("Failed to send OTP.");
      }
    })
    .catch(error => {
      console.error("Error sending OTP:", error);
      alert("Failed to send OTP. Try again later.");
    });
});

verifyOtpBtn.addEventListener('click', () => {
  const otp = otpInput.value.trim();

  if (!otp) {
    alert("Please enter the OTP.");
    return;
  }

  // Verify OTP with backend
  const email = emailInput.value.trim(); // Get the email for OTP verification
  fetch('http://localhost:3000/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userEmail: email, otp: otp })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        alert("OTP verified successfully!");
        // Enable password fields and register button
        passwordInput.disabled = false;
        retypeInput.disabled = false;
        registerBtn.disabled = false;
      } else {
        alert("Failed to verify OTP: " + data.message);
      }
    })
    .catch(error => {
      console.error("Error verifying OTP:", error);
      alert("Failed to verify OTP. Try again later.");
    });
});

document.addEventListener('DOMContentLoaded', () => {
  const dobInput = document.getElementById('dob');

  // Calculate today's date minus 10 years
  const today = new Date();
  today.setFullYear(today.getFullYear() - 10);
  const maxDate = today.toISOString().split('T')[0];

  // Set the max attribute to ensure at least 10 years old
  dobInput.max = maxDate;
});

document.getElementById('photo').addEventListener('change', function(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('preview').src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
});


document.getElementById('signupForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const password = passwordInput.value.trim();
  const retype = retypeInput.value.trim();

  if (password !== retype) {
    alert("Passwords do not match.");
    return;
  }

  const formData = new FormData();
  formData.append('name', document.getElementById('name').value);
  formData.append('gender', document.getElementById('gender').value);
  formData.append('email', emailInput.value.trim());
  formData.append('dob', document.getElementById('dob').value);
  formData.append('city', document.getElementById('city').value);
  formData.append('country', document.getElementById('country').value);
  formData.append('password', password);
  formData.append('about', document.getElementById('about').value);
  formData.append('photo', document.getElementById('photo').files[0]);

  try {
    const res = await fetch('http://localhost:3000/register', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (data.success) {
      alert("Registration successful!");
      window.location.href = "index.html";
    } else {
      if (data.error === 'Email already registered. Please use another email.') {
        alert(data.error);
      } else {
        alert("Registration failed: " + (data.error || "Unknown error"));
      }
    }
    
  } catch (err) {
    console.error("Registration Error:", err);
    alert("Something went wrong.");
  }
});


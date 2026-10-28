// =========================================================
// LOGIN
// =========================================================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;
        const message = document.getElementById("message");

        message.style.color = "";
        message.textContent = "Logging in...";

        const result = await apiPost("/api/login", { email, password });

        if (result.success && result.data?.token && result.data?.user) {
            // Store token separately for API calls and alongside user for existing code.
            localStorage.setItem("token", result.data.token);
            localStorage.setItem("user", JSON.stringify({
                ...result.data.user,
                token: result.data.token
            }));
            localStorage.removeItem("authToken");

            message.style.color = "green";
            message.textContent = "Login successful!";

            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 500);
        } else {
            message.style.color = "red";
            message.textContent =
                result.data?.message || "Login failed. Check your email and password.";
            console.error("Login failed:", result);
        }
    });
}

// =========================================================
// REGISTER
// =========================================================

const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const phone = document.getElementById("phone").value.trim();
        const password = document.getElementById("password").value;
        const confirmPassword = document.getElementById("confirmPassword").value;
        const message = document.getElementById("message");

        if (password !== confirmPassword) {
            message.style.color = "red";
            message.textContent = "Passwords do not match.";
            return;
        }

        if (password.length < 8) {
            message.style.color = "red";
            message.textContent = "Password must contain at least 8 characters.";
            return;
        }

        message.style.color = "";
        message.textContent = "Creating account...";

        const result = await apiPost("/api/register", {
            name,
            email,
            phone,
            password,
            role: document.getElementById("role")?.value || "Donor"
        });

        if (result.success) {
            message.style.color = "green";
            message.textContent = "Account created successfully! You can now log in.";

            setTimeout(() => {
                window.location.href = "index.html";
            }, 800);
        } else {
            message.style.color = "red";
            message.textContent =
                result.data?.message || "Registration failed.";
            console.error("Registration failed:", result);
        }
    });
}

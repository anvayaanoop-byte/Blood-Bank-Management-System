const loginForm = document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const email =
            document.getElementById("email").value.trim();

        const password =
            document.getElementById("password").value;

        const message =
            document.getElementById("message");

        message.textContent = "Logging in...";

        const result = await apiRequest(
            "/api/login",
            {
                method: "POST",

                body: JSON.stringify({
                    email: email,
                    password: password
                })
            }
        );

        if (result.success) {

            localStorage.setItem(
                "user",
                JSON.stringify(result.data)
            );

            message.style.color = "green";
            message.textContent = "Login successful!";

            setTimeout(() => {

                window.location.href =
                    "dashboard.html";

            }, 700);

        } else {

            message.style.color = "red";

            message.textContent =
                result.data.message ||
                "Login failed";
        }

    });

}
const registerForm = document.getElementById("registerForm");

if (registerForm) {

    registerForm.addEventListener("submit", async function (event) {

        event.preventDefault();

        const name =
            document.getElementById("name").value.trim();

        const email =
            document.getElementById("email").value.trim();

        const phone =
            document.getElementById("phone").value.trim();

        const password =
            document.getElementById("password").value;

        const confirmPassword =
            document.getElementById("confirmPassword").value;

        const message =
            document.getElementById("message");


        // Check passwords
        if (password !== confirmPassword) {

            message.style.color = "red";

            message.textContent =
                "Passwords do not match.";

            return;
        }


        message.style.color = "#555";

        message.textContent =
            "Creating account...";


        const result = await apiRequest(
            "/api/register",
            {
                method: "POST",

                body: JSON.stringify({
                    name: name,
                    email: email,
                    phone: phone,
                    password: password
                })
            }
        );


        if (result.success) {

            message.style.color = "green";

            message.textContent =
                "Account created successfully!";

            setTimeout(() => {

                window.location.href =
                    "index.html";

            }, 1000);

        } else {

            message.style.color = "red";

            message.textContent =
                result.data.message ||
                "Registration failed.";
        }

    });

}
const form = document.querySelector("#enquiryForm");
const note = document.querySelector("#formNote");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const payload = {
    name: data.get("name"),
    email: data.get("email"),
    phone: data.get("phone"),
    status: data.get("status"),
    interest: data.get("interest"),
    message: data.get("message"),
  };

  note.textContent = "Submitting your enquiry...";

  try {
    const response = await fetch("/api/enquiries", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to submit enquiry.");
    }

    form.reset();
    note.textContent = result.message;
  } catch (error) {
    note.textContent =
      error.message || "The backend is not running. Please start the local server and try again.";
  }
});

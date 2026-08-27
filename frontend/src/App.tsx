import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { FeedbackProvider } from "./context/FeedbackContext";
import AppRouter from "./AppRouter";

export default function App() {
  return (
    <ThemeProvider>
      <FeedbackProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </FeedbackProvider>
    </ThemeProvider>
  );
}

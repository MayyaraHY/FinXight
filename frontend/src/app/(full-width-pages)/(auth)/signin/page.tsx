import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Financial Engine",
  description: "Sign in to your Financial Engine account",
};

export default function SignIn() {
  return <SignInForm />;
}

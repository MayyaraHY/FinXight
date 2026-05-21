import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | Financial Engine",
  description: "Create your Financial Engine account",
};

export default function SignUp() {
  return <SignUpForm />;
}

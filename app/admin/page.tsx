import { getIsAdmin } from "@/lib/admin";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import LoadingSVG from "@/public/img/icons/loader.svg";

// Dynamically import the AdminApp component and disable SSR
// react-admin is a client-side library and should not be rendered on the server
const AdminApp = dynamic(() => import("@/components/admin/App"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center">
      <LoadingSVG className="size-8 animate-spin" />
    </div>
  ),
});

const AdminPage = () => {
  const isAdmin = getIsAdmin();

  if (!isAdmin) {
    redirect("/");
  }

  return <AdminApp />;
};

export default AdminPage;
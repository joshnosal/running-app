"use client";

import MuiAppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import MenuIcon from "@mui/icons-material/Menu";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

const DRAWER_WIDTH = 220;

interface AppBarProps {
  onMenuClick?: () => void;
}

export default function AppBarComponent({ onMenuClick }: AppBarProps) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <MuiAppBar
      position="fixed"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, width: "100%" }}
    >
      <Toolbar>
        {onMenuClick && (
          <IconButton
            color="inherit"
            edge="start"
            onClick={onMenuClick}
            sx={{ mr: 1, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
        )}
        <DirectionsRunIcon sx={{ mr: 1 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          RunAnalytics
        </Typography>
        <Button color="inherit" onClick={handleSignOut}>
          Sign Out
        </Button>
      </Toolbar>
    </MuiAppBar>
  );
}

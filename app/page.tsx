import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import BarChartIcon from "@mui/icons-material/BarChart";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";

export default function LandingPage() {
  const features = [
    {
      icon: <DirectionsRunIcon fontSize="large" color="primary" />,
      title: "Upload Garmin FIT Files",
      desc: "Import your runs directly from Garmin devices. All data stored securely.",
    },
    {
      icon: <BarChartIcon fontSize="large" color="primary" />,
      title: "Training Load Overview",
      desc: "12-week mileage charts, HR zone distribution, and weekly summaries.",
    },
    {
      icon: <TrendingUpIcon fontSize="large" color="primary" />,
      title: "Efficiency Trends",
      desc: "Track pace, power, cadence, and running dynamics over time.",
    },
    {
      icon: <FitnessCenterIcon fontSize="large" color="primary" />,
      title: "HR Zone Analysis",
      desc: "Customizable HR zones by formula or manual BPM boundaries.",
    },
  ];

  return (
    <Box>
      {/* Nav */}
      <Box
        sx={{
          px: 3,
          py: 2,
          display: "flex",
          alignItems: "center",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <DirectionsRunIcon color="primary" sx={{ mr: 1 }} />
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          RunAnalytics
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button href="/sign-in" variant="outlined">
            Sign In
          </Button>
          <Button href="/sign-up" variant="contained">
            Get Started
          </Button>
        </Stack>
      </Box>

      {/* Hero */}
      <Box sx={{ bgcolor: "primary.main", color: "white", py: 10, textAlign: "center" }}>
        <Container maxWidth="md">
          <Typography variant="h2" fontWeight="bold" gutterBottom>
            Understand Your Running
          </Typography>
          <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
            Upload Garmin FIT files, visualize training load, and spot efficiency trends — all in one place.
          </Typography>
          <Button
            href="/sign-up"
            variant="contained"
            size="large"
            sx={{ bgcolor: "white", color: "primary.main", "&:hover": { bgcolor: "grey.100" } }}
          >
            Start for Free
          </Button>
        </Container>
      </Box>

      {/* Features */}
      <Container maxWidth="lg" sx={{ py: 8 }}>
        <Typography variant="h4" textAlign="center" gutterBottom>
          Everything You Need
        </Typography>
        <Grid container spacing={3} sx={{ mt: 2 }}>
          {features.map((f) => (
            <Grid key={f.title} size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper sx={{ p: 3, textAlign: "center", height: "100%" }}>
                {f.icon}
                <Typography variant="h6" sx={{ mt: 1, mb: 1 }}>
                  {f.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {f.desc}
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA */}
      <Box sx={{ bgcolor: "grey.100", py: 6, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>
          Ready to analyse your training?
        </Typography>
        <Button href="/sign-up" variant="contained" size="large">
          Create Free Account
        </Button>
      </Box>
    </Box>
  );
}

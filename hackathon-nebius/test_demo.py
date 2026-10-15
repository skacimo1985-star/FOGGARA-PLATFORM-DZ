import unittest

from demo import Readings, recommend


class SafeDemoTests(unittest.TestCase):
    def test_low_moisture_and_energy_deficit(self):
        result = recommend(Readings(24, 45, 2, 3))
        self.assertIn("LOW_SOIL_MOISTURE", result["risk_flags"])
        self.assertIn("SOLAR_POWER_DEFICIT", result["risk_flags"])
        self.assertTrue(result["requires_human_approval"])
        self.assertFalse(result["actuation_permitted"])
        self.assertIsNone(result["operational_command"])

    def test_low_reserve_prioritized(self):
        result = recommend(Readings(10, 15, 4, 2))
        self.assertIn("Check water availability", result["proposal"])
        self.assertIn("LOW_WATER_RESERVE", result["risk_flags"])

    def test_bad_percentage_rejected(self):
        with self.assertRaises(ValueError):
            recommend(Readings(101, 20, 2, 2))

    def test_nonfinite_rejected(self):
        with self.assertRaises(ValueError):
            recommend(Readings(float("nan"), 20, 2, 2))


if __name__ == "__main__":
    unittest.main()

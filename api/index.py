import sys
import os

# Add project root directory to sys.path so backend module can be imported seamlessly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app

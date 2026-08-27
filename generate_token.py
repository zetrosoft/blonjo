import sys
import os
sys.path.insert(0, os.path.abspath('sajen'))
from app.core.security import create_access_token
from datetime import timedelta
print(create_access_token(subject="1", expires_delta=timedelta(hours=1)))
